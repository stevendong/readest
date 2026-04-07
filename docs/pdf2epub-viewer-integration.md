# Readest 作为 pdf2epub-new 在线阅读器 — 实施方案

## 1. 项目背景

### 1.1 目标

将 [Readest](https://github.com/readest/readest)（开源跨平台电子书阅读器）裁剪部署为 pdf2epub-new 项目的附属服务，作为**在线 EPUB 书库 + 阅读器**。用户在 pdf2epub 完成 PDF 转换后，无需手动操作，转换成功的 EPUB 自动出现在 Readest 书库中，可直接在线阅读。

### 1.2 现有架构

| 服务          | 技术栈                        | 部署位置         |
| ------------- | ----------------------------- | ---------------- |
| pdf2epub 前端 | React + Vite + TypeScript     | Cloudflare Pages |
| pdf2epub 后端 | FastAPI + Celery + PostgreSQL | Railway          |
| 文件存储      | Cloudflare R2（S3 兼容）      | Cloudflare       |
| 认证服务      | Supabase Auth                 | Supabase         |
| 数据库        | PostgreSQL (Supabase)         | Supabase         |

### 1.3 Readest 现状

- **框架**：Next.js 16 + React 19 + TypeScript
- **多平台**：Web / Desktop (Tauri) / Mobile (Tauri)
- **渲染引擎**：foliate-js（支持 EPUB, PDF, MOBI 等多格式）
- **状态管理**：Zustand
- **认证**：Supabase Auth（与 pdf2epub 相同）
- **书库存储**：Web 端使用 IndexedDB，桌面端使用本地文件系统
- **现有 CF 部署**：已有 OpenNext + wrangler.toml 的 Cloudflare Workers 部署配置

---

## 2. 目标架构

```
用户浏览器
    │
    ├──▶ pdf2epub.com (Cloudflare Pages)
    │     React + Vite 前端
    │     上传 PDF → 发起转换 → 查看任务状态
    │
    ├──▶ reader.pdf2epub.com (Cloudflare Pages)  ← 新增
    │     Readest (Next.js) 精简版
    │     自动展示已完成的 EPUB 书库
    │     在线阅读 EPUB
    │
    └──▶ 共享 Supabase Auth（同一个项目，用户账号互通）

    内部调用关系：
    reader.pdf2epub.com
        │
        ├── GET api.pdf2epub.com/api/tasks?status=completed
        │   → 获取当前用户的已完成任务列表
        │
        ├── GET api.pdf2epub.com/api/tasks/{id}/read
        │   → 获取 EPUB 文件的 R2 presigned URL
        │
        └── Fetch R2 presigned URL
            → 加载 EPUB 文件到 foliate-js 渲染
```

---

## 3. 数据流设计

### 3.1 核心数据流：任务列表 → 书库

```
pdf2epub 后端 (PostgreSQL)
┌──────────────────────────────────────────┐
│ tasks 表                                  │
│ ┌──────────┬──────────┬────────────────┐ │
│ │ id (UUID)│ user_id  │ status         │ │
│ │ filename │ output_  │ book_metadata  │ │
│ │          │ path     │ (JSON)         │ │
│ └──────────┴──────────┴────────────────┘ │
└──────────────────┬───────────────────────┘
                   │
                   │ GET /api/tasks?status=completed
                   ▼
Readest 前端 (libraryStore)
┌──────────────────────────────────────────┐
│ Task → Book 映射                          │
│                                           │
│ task.id           → book.hash             │
│ task.filename     → book.title            │
│ task.book_metadata→ book.author/metadata  │
│ task.output_path  → book.url (presigned)  │
│ task.created_at   → book.createdAt        │
│ 'EPUB'            → book.format           │
└──────────────────────────────────────────┘
```

### 3.2 R2 存储路径映射

pdf2epub-new 的 R2 存储结构：

```
R2 Bucket
├── uploads/{task_id}/{filename}           # 原始 PDF
├── outputs/{task_id}/output.epub          # 转换后的 EPUB ← Readest 需要读取
├── outputs/{task_id}/content.md           # 中间 Markdown
├── outputs/{task_id}/book_metadata.json   # 书籍元数据
└── outputs/{task_id}/ocr_pages/           # OCR 结果
```

Readest 只需要访问 `outputs/{task_id}/output.epub`，通过后端 API 获取 presigned URL，不直接访问 R2。

### 3.3 Readest Book 类型适配

Readest 的 `Book` 接口（`src/types/book.ts`）已原生支持远程加载：

```typescript
export interface Book {
  url?: string; // ← 远程 book 通过 URL 懒加载内容
  hash: string; // ← 用 task_id 作为唯一标识
  format: BookFormat; // ← 'EPUB'
  title: string;
  author: string;
  coverImageUrl?: string | null;
  createdAt: number;
  updatedAt: number;
  // ... 其他字段
}
```

---

## 4. 认证方案

### 4.1 共享 Supabase Auth

两个前端使用**同一个 Supabase 项目**的 URL 和 anon key：

```
SUPABASE_URL = https://zewviqgwenzhvbvgysyj.supabase.co
SUPABASE_ANON_KEY = <same-key>
```

Readest 已使用 Base64 编码方式存储这些值：

```env
NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64=<base64(SUPABASE_URL)>
NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64=<base64(SUPABASE_ANON_KEY)>
```

### 4.2 Session 处理

两个站点在不同域名（`pdf2epub.com` vs `reader.pdf2epub.com`），localStorage 不共享。

**方案 A（推荐）：独立登录，用户无感**

- 用户首次访问 `reader.pdf2epub.com` 时，走标准 Supabase OAuth 登录
- 因为是同一个 Supabase 项目，如果用户已在 Google/GitHub 等 OAuth 提供商处有 session，登录几乎是瞬间完成的
- 登录后 session 持久化在 `reader.pdf2epub.com` 的 localStorage 中
- 后续访问无需重新登录

**方案 B：跳转时传递 token**

如果需要从 pdf2epub 无缝跳转到 reader 且不需要二次登录：

```
https://reader.pdf2epub.com/library?token={access_token}&refresh_token={refresh_token}
```

Readest 端接收后调用：

```typescript
const params = new URLSearchParams(window.location.search);
const accessToken = params.get('token');
const refreshToken = params.get('refresh_token');

if (accessToken && refreshToken) {
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  // 安全起见，清除 URL 中的 token
  window.history.replaceState({}, '', window.location.pathname);
}
```

### 4.3 API 鉴权

Readest 前端调用 pdf2epub 后端 API 时，携带 Supabase JWT：

```typescript
const {
  data: { session },
} = await supabase.auth.getSession();
const response = await fetch(`${PDF2EPUB_API_URL}/api/tasks?status=completed`, {
  headers: {
    Authorization: `Bearer ${session.access_token}`,
  },
});
```

pdf2epub 后端已有完善的 JWT 验证中间件（`get_activated_user`），无需额外改造。

---

## 5. 需要的改造

### 5.1 pdf2epub-new 后端改造（工作量：0.5 天）

#### 5.1.1 新增在线阅读 API

当前 `GET /api/tasks/{task_id}/download` 对非付费用户会注入水印。在线阅读场景需要一个**无水印的只读 presigned URL**：

```python
# backend/src/entries/entry_api.py

@router.get("/tasks/{task_id}/read")
async def get_read_url(task_id: str, user: dict = Depends(get_activated_user)):
    """
    获取 EPUB 在线阅读 URL（presigned，短有效期，无水印）
    """
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _verify_task_owner(task, user)

    if task.get('status') != 'completed':
        raise HTTPException(status_code=400, detail="Task not completed")

    output_path = task.get('output_path')
    if not output_path:
        raise HTTPException(status_code=404, detail="Output file not found")

    # 生成短期 presigned URL（10 分钟有效）
    from src.atoms.atom_hybrid_backend import get_storage_backend
    backend = get_storage_backend()
    key = _extract_storage_key(output_path)
    presigned_url = backend.get_url(key, expires=600)

    if not presigned_url:
        raise HTTPException(status_code=404, detail="File not accessible")

    return {
        "url": presigned_url,
        "expires_in": 600,
        "task_id": task_id,
    }
```

> **备选方案**：如果不想新增 API，也可以直接复用现有的 `GET /api/tasks/{task_id}/download`。对付费用户已经返回 presigned URL；对非付费用户返回水印版本的 bytes，前端 `new Blob()` 后也能用 `URL.createObjectURL()` 交给 foliate-js 渲染。

#### 5.1.2 CORS 配置

在 FastAPI 的 CORS middleware 中添加 Readest 域名：

```python
# backend/src/entries/entry_api.py 或 CORS 配置处

origins = [
    "https://pdf2epub.com",
    "https://www.pdf2epub.com",
    "https://reader.pdf2epub.com",   # ← 新增
    "http://localhost:3000",          # 本地开发
]
```

#### 5.1.3 任务列表 API 增强（可选）

当前 `GET /api/tasks` 返回的 `items` 中，已完成任务包含 `download_url`。可以额外返回 `book_metadata`（标题、作者等），方便 Readest 显示更丰富的书籍信息：

```python
for item in result['items']:
    if item.get('status') == 'completed':
        item['download_url'] = f"/api/tasks/{task_id}/download"
        item['read_url'] = f"/api/tasks/{task_id}/read"          # ← 新增
        # 加载 book_metadata.json（如果存在）
        metadata = _load_book_metadata(task_id)                   # ← 新增
        if metadata:
            item['book_metadata'] = metadata
```

### 5.2 Readest 裁剪（工作量：1-2 天）

#### 5.2.1 路由裁剪

| 路由       | 处理方式       | 说明                                             |
| ---------- | -------------- | ------------------------------------------------ |
| `/library` | **保留并改造** | 数据源从 IndexedDB 改为 pdf2epub API             |
| `/reader`  | **保留**       | EPUB 渲染核心，改造为支持远程 presigned URL 加载 |
| `/auth`    | **保留**       | Supabase OAuth 登录                              |
| `/` (首页) | **简化**       | 重定向到 `/library`                              |
| `/user`    | **移除**       | 用户管理、付费、存储配额在 pdf2epub 主站处理     |
| `/updater` | **移除**       | 无桌面端更新需求                                 |
| `/opds`    | **移除**       | 不需要 OPDS 目录                                 |

#### 5.2.2 依赖裁剪

**移除的依赖**（约 140 个，此处列出主要的）：

```
# Tauri 桌面/移动端（全部移除）
@tauri-apps/api
@tauri-apps/plugin-*  (共 15 个)
tauri-plugin-device-info-api

# 支付
@stripe/react-stripe-js
@stripe/stripe-js
stripe

# AI 助手
ai
ai-sdk-ollama
@ai-sdk/react
@assistant-ui/react
@assistant-ui/react-ai-sdk
@assistant-ui/react-markdown

# PWA
@serwist/next
@serwist/webpack-plugin
serwist

# 数据同步
@tursodatabase/database-wasm
@tursodatabase/database-common
@tursodatabase/database

# 云存储（Readest 自身的存储，改用 pdf2epub 的）
@aws-sdk/client-s3
@aws-sdk/s3-request-presigner
aws4fetch

# 分析
posthog-js

# 其他
app-store-server-api
google-auth-library
googleapis
```

**保留的核心依赖**：

```
# 渲染引擎
foliate-js (workspace)
@zip.js/zip.js
dompurify
nunjucks
marked
highlight.js

# 框架
next
react / react-dom
zustand
styled-jsx

# UI
@radix-ui/*
daisyui
tailwindcss
clsx / class-variance-authority / tailwind-merge
lucide-react / react-icons
overlayscrollbars / overlayscrollbars-react

# 认证
@supabase/supabase-js
@supabase/auth-ui-react
@supabase/auth-ui-shared

# 国际化
i18next
react-i18next
i18next-browser-languagedetector
i18next-http-backend

# 工具
dayjs
nanoid
uuid
semver
zod
```

#### 5.2.3 Library 组件裁剪

library 页面中需要移除的功能模块：

| 组件/功能                         | 处理方式                       |
| --------------------------------- | ------------------------------ |
| `useDemoBooks`                    | 移除（不需要示例书）           |
| `useDragDropImport`               | 移除（不需要本地导入）         |
| `useBooksSync`                    | **替换**为从 pdf2epub API 同步 |
| `useTransferQueue`                | 移除（不需要上传/下载队列）    |
| `useOpenWithBooks`                | 移除（桌面端功能）             |
| `ImportMenu`                      | 移除（不需要导入按钮）         |
| `BackupWindow`                    | 移除                           |
| `MigrateDataWindow`               | 移除                           |
| `TransferQueuePanel`              | 移除                           |
| `OPDSDialog`                      | 移除                           |
| `BookshelfItem` 中的上传/下载操作 | 移除                           |

### 5.3 Readest 核心改造（工作量：1 天）

#### 5.3.1 新增 pdf2epub API 服务层

```typescript
// src/services/pdf2epubApi.ts

const API_BASE = process.env['NEXT_PUBLIC_PDF2EPUB_API_URL'];

export interface Pdf2epubTask {
  id: string;
  filename: string;
  status: string;
  total_pages: number;
  processed_pages: number;
  created_at: string;
  completed_at: string | null;
  download_url: string;
  read_url?: string;
  book_metadata?: {
    title?: string;
    author?: string;
    language?: string;
    cover_image?: string;
  };
}

export interface TaskListResponse {
  items: Pdf2epubTask[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/**
 * 获取当前用户已完成的转换任务列表
 */
export async function fetchCompletedTasks(
  token: string,
  page = 1,
  size = 50,
): Promise<TaskListResponse> {
  const resp = await fetch(`${API_BASE}/api/tasks?status=completed&page=${page}&size=${size}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

/**
 * 获取 EPUB 在线阅读 URL
 */
export async function fetchReadUrl(
  token: string,
  taskId: string,
): Promise<{ url: string; expires_in: number }> {
  const resp = await fetch(`${API_BASE}/api/tasks/${taskId}/read`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}
```

#### 5.3.2 Task → Book 映射函数

```typescript
// src/services/pdf2epubApi.ts (续)

import { Book } from '@/types/book';

/**
 * 将 pdf2epub 任务转换为 Readest Book 对象
 */
export function taskToBook(task: Pdf2epubTask): Book {
  const metadata = task.book_metadata;
  const title = metadata?.title || task.filename.replace(/\.pdf$/i, '') || 'Untitled';
  const author = metadata?.author || '';

  return {
    hash: task.id,
    format: 'EPUB',
    title,
    author,
    url: task.read_url
      ? `${API_BASE}${task.read_url}`
      : `${API_BASE}/api/tasks/${task.id}/download`,
    coverImageUrl: metadata?.cover_image || null,
    createdAt: new Date(task.created_at).getTime(),
    updatedAt: new Date(task.completed_at || task.created_at).getTime(),
    primaryLanguage: metadata?.language,
  };
}
```

#### 5.3.3 改造 Library 初始化逻辑

替换 `library/page.tsx` 中的 `initLibrary` 函数：

```typescript
// 原来：从 IndexedDB 加载
const library = await appService.loadLibraryBooks();

// 改为：从 pdf2epub API 加载
import { fetchCompletedTasks, taskToBook } from '@/services/pdf2epubApi';

const initLibrary = async () => {
  const appService = await envConfig.getAppService();
  const settings = await appService.loadSettings();
  setSettings(settings);

  // 从 pdf2epub API 获取已完成任务
  if (!token) return;
  const tasksResp = await fetchCompletedTasks(token, 1, 100);
  const remoteBooks = tasksResp.items.map(taskToBook);

  // 合并本地阅读进度（IndexedDB 中保存的 BookConfig）
  const localLibrary = await appService.loadLibraryBooks();
  const mergedLibrary = mergeRemoteAndLocal(remoteBooks, localLibrary);

  setLibrary(mergedLibrary);
  setLibraryLoaded(true);
};

/**
 * 合并远程书单和本地阅读进度
 * 远程为权威数据源（哪些书存在），本地保存阅读进度、标注等
 */
function mergeRemoteAndLocal(remote: Book[], local: Book[]): Book[] {
  const localMap = new Map(local.map((b) => [b.hash, b]));

  return remote.map((book) => {
    const localBook = localMap.get(book.hash);
    if (localBook) {
      // 保留本地的阅读进度和设置
      return {
        ...book,
        progress: localBook.progress,
        readingStatus: localBook.readingStatus,
        // 其他本地状态...
      };
    }
    return book;
  });
}
```

#### 5.3.4 改造 Reader 的 EPUB 加载

Reader 已支持通过 `book.url` 加载远程文件。但 presigned URL 有有效期（10 分钟），需要确保：

1. 打开书时实时获取 presigned URL（而非使用列表中缓存的旧 URL）
2. 长时间阅读时刷新 URL

```typescript
// 在 reader 初始化时，获取最新的 presigned URL
import { fetchReadUrl } from '@/services/pdf2epubApi';

async function loadBookContent(book: Book, token: string): Promise<Blob> {
  // 获取最新的 presigned URL
  const { url } = await fetchReadUrl(token, book.hash);

  // 下载 EPUB 到内存
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch EPUB');
  return response.blob();
}
```

---

## 6. 部署方案

### 6.1 Cloudflare Pages 配置

#### wrangler.toml（精简版）

```toml
name = "pdf2epub-reader"
main = ".open-next/worker.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[observability]
enabled = true
head_sampling_rate = 0.01

[assets]
directory = ".open-next/assets"
binding = "ASSETS"

# 不需要 KV、R2 等绑定（EPUB 文件从 pdf2epub 的 R2 获取）
```

#### 构建命令

```bash
# CF Pages 构建设置
Build command: pnpm install && pnpm setup-vendors && pnpm build-web
Build output directory: .open-next
```

### 6.2 环境变量

```env
# 必需
NEXT_PUBLIC_APP_PLATFORM=web
NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64=<与pdf2epub相同>
NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64=<与pdf2epub相同>
NEXT_PUBLIC_PDF2EPUB_API_URL=https://api.pdf2epub.com

# 可选
NODE_ENV=production
```

### 6.3 域名配置

1. 在 Cloudflare DNS 中添加：

   ```
   reader.pdf2epub.com → CNAME → pdf2epub-reader.pages.dev
   ```

2. 在 Cloudflare Pages 项目中绑定自定义域名 `reader.pdf2epub.com`

3. SSL 证书由 Cloudflare 自动管理

### 6.4 CI/CD（可选）

```yaml
# .github/workflows/deploy-reader.yml
name: Deploy Reader to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm setup-vendors
      - run: pnpm build-web
        env:
          NEXT_PUBLIC_APP_PLATFORM: web
          NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64: ${{ secrets.SUPABASE_URL_BASE64 }}
          NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64: ${{ secrets.SUPABASE_KEY_BASE64 }}
          NEXT_PUBLIC_PDF2EPUB_API_URL: ${{ secrets.PDF2EPUB_API_URL }}

      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy .open-next --project-name=pdf2epub-reader
```

---

## 7. 实施计划

### Phase 1：裁剪与基础搭建（1-2 天）

- [ ] Fork Readest 代码到 pdf2epub-reader 仓库
- [ ] 移除无关路由：`/user`、`/updater`、`/opds`
- [ ] 移除 Tauri 相关代码和依赖（`@tauri-apps/*`）
- [ ] 移除 Stripe 支付相关
- [ ] 移除 AI 助手相关（`ai`、`@ai-sdk/*`、`@assistant-ui/*`）
- [ ] 移除 PWA 相关（`@serwist/*`）
- [ ] 移除 PostHog 分析
- [ ] 移除 Turso 数据库
- [ ] 移除 AWS S3 SDK（Readest 自身的云存储）
- [ ] 验证：精简后项目能 `pnpm dev-web` 正常启动

### Phase 2：API 集成（1 天）

- [ ] 新建 `src/services/pdf2epubApi.ts`，实现 API 调用
- [ ] 实现 Task → Book 映射函数
- [ ] 改造 `libraryStore` 数据加载逻辑
- [ ] 改造 Library 页面，移除导入/上传/下载等 UI
- [ ] 改造 Reader 的 EPUB 加载流程，支持 presigned URL
- [ ] 本地联调：mock pdf2epub API 验证流程

### Phase 3：pdf2epub 后端适配（0.5 天）

- [ ] 新增 `GET /api/tasks/{task_id}/read` API
- [ ] CORS 配置添加 `reader.pdf2epub.com`
- [ ] （可选）任务列表 API 增加 `book_metadata` 字段
- [ ] 本地联调验证

### Phase 4：部署上线（0.5 天）

- [ ] 配置 Cloudflare Pages 项目
- [ ] 设置环境变量
- [ ] 绑定 `reader.pdf2epub.com` 域名
- [ ] 端到端测试：登录 → 查看书库 → 打开阅读 EPUB
- [ ] （可选）配置 CI/CD

### Phase 5：集成入口（0.5 天）

- [ ] pdf2epub 前端任务列表页添加"在线阅读"按钮
- [ ] 跳转链接：`https://reader.pdf2epub.com/library`（方案 A）或带 token 的链接（方案 B）
- [ ] pdf2epub 转换完成通知中添加"在线阅读"链接

---

## 8. 风险与应对

| 风险                   | 影响                                                       | 应对措施                                                       |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| **裁剪引入编译错误**   | 代码中大量跨模块引用 Tauri API，删除后需要逐一修复         | 使用 TypeScript 编译器定位所有引用，逐步替换为空实现或条件判断 |
| **Presigned URL 过期** | 用户长时间阅读时 URL 失效，EPUB 内的资源（图片等）无法加载 | EPUB 在初次加载时完整下载到内存/IndexedDB，后续阅读走本地缓存  |
| **CORS 拦截**          | Readest 前端直接请求 pdf2epub API 被浏览器拦截             | 确保后端 CORS 配置正确；R2 presigned URL 不存在 CORS 问题      |
| **大文件加载慢**       | 部分 EPUB 文件较大（>50MB），首次打开等待时间长            | 显示加载进度条；后续从 IndexedDB 缓存读取                      |
| **Supabase JWT 过期**  | 前端长时间不操作，token 过期后 API 调用失败                | Supabase SDK 自动刷新 token；API 调用时检测 401 触发 re-auth   |
| **Readest 上游更新**   | Fork 后难以跟进上游的 bug fix 和新功能                     | 保持 Fork 结构清晰，定期 rebase；只修改必要文件，减少冲突面    |

---

## 9. 后续扩展

- **阅读进度云端同步**：将 Readest 的阅读进度（BookConfig）同步回 pdf2epub 的数据库，实现跨设备阅读续读
- **封面图自动提取**：pdf2epub 转换时提取 EPUB 封面图，存储到 R2，在书库列表中显示
- **阅读数据分析**：统计用户阅读时长、完成率，反馈到 pdf2epub 的用户面板
- **批注导出**：将 Readest 中的标注、笔记导出，与 pdf2epub 的 Markdown 输出结合
