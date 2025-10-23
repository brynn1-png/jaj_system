 # 📘 Project Best Practices

## 1. Project Purpose
A browser-based Student Attendance System that:
- Captures attendance via RFID inputs (manual entry or simulated scans)
- Notifies parents via a notifications log (student_sms table)
- Persists data in Supabase (students, attendance, student_sms) with realtime updates
- Operates in offline mode using localStorage fallbacks

Domain: school operations, attendance tracking, parent notifications.

## 2. Project Structure
- index.html: Redirects to the login page
- src/
  - html/
    - login.html, dashboard.html, students.html, attendance.html, notifications.html, test-supabase-connection.html
  - js/
    - supabase-config.js: Bootstraps Supabase client. Prefer injecting credentials via `window.SUPABASE_URL` and `window.SUPABASE_ANON_KEY` before this script loads. Do not hard-code keys.
    - api.js: Data access layer. Uses Supabase when available; falls back to localStorage. Exposes methods:
      - fetchStudents, addStudent, updateStudent, archiveStudent
      - fetchAttendanceRecords, addAttendanceRecord, getAttendanceByStudentAndDate
      - getStudentByRfid
      - addNotification, fetchNotifications
    - realtime.js: Subscribes to Supabase realtime channels for `attendance` and `student_sms`. No-ops if client missing.
    - app-new.js: Main client-side logic (init, RFID scan flow, UI rendering, stats, notifications, realtime wiring).
    - auth.js: LocalStorage-based login session (simple, not production-secure). Exposes `isLoggedIn, setLoggedIn, logout, redirectToLogin, confirmLogout`.
    - login.js: Handles login form UX and redirects to dashboard on success.
    - ui.js: Minimal notification/toast utility injected globally as `window.showNotification`.
  - css/
    - modern-styles.css: Design system tokens and page/component styling.
- supabase/
  - schema.sql: SQL to create tables, basic permissive RLS, and realtime publications. Includes storage bucket setup instructions for `avatars`.
- TODO.md: Implementation notes and acceptance criteria.

Key page roles:
- login.html: Entry authentication UI (local-only); loads login.js
- dashboard.html: Scanner UX, live attendance log, notification center
- students.html: Student management (add/edit/archive)
- attendance.html: Current attendance and history views
- notifications.html: Tabular view of parent notifications
- test-supabase-connection.html: Connectivity smoke test page

Entry points and config:
- Load `supabase-config.js` before any module that accesses Supabase
- Provide Supabase credentials via `window.SUPABASE_URL` and `window.SUPABASE_ANON_KEY` in a non-committed snippet or separate config during development

## 3. Test Strategy
Current state: No automated tests in repo; manual testing via pages and the Supabase test page.

Recommended approach:
- Unit tests (Jest/Vitest) for pure utilities and helpers
  - Example targets: `todayYmdLocal`, `validateRfidFormat`, small render helpers producing strings/objects
- Integration tests for ApiService
  - Mock Supabase client or use MSW/fetch mocks; include tests for localStorage fallback paths
  - Validate duplicate-prevention logic via `getAttendanceByStudentAndDate`
- End-to-end tests (Cypress/Playwright)
  - Critical flows: login, load students, RFID scan simulation, attendance creation once-per-day, notification creation, filtering/sorting on pages

Conventions:
- Place tests alongside files or under `tests/` using `*.test.js`
- Aim for ≥80% coverage of business logic (excluding DOM-only code)
- Add a lightweight CI check (optional) when/if a build step is introduced

Manual testing aids:
- Use `src/html/test-supabase-connection.html` to verify DB access
- Seed DB with `schema.sql` and optional sample data (commented) when needed

## 4. Code Style
- Module system
  - Use ES Modules with explicit imports/exports
  - Prefer importing functions instead of relying on globals; if globals are needed for HTML inline handlers, expose intentionally on `window` (as done for `ApiService`, `RealtimeService`, `showNotification`)
- Async and error handling
  - Use async/await with try/catch
  - Log with `console.error` and surface user-friendly messages via `showNotification`
  - Treat Supabase errors distinctly; fallback to localStorage where designed
- Naming conventions
  - Files: kebab-case (e.g., `app-new.js`, `supabase-config.js`)
  - Functions/variables: camelCase (e.g., `getStudentByRfid`, `loadAttendanceRecords`)
  - Constants: UPPER_SNAKE_CASE (e.g., `LS_KEYS`)
  - Event handlers prefixed with `handle*` (e.g., `handleRfidScan`)
  - Rendering functions prefixed with `render*` or `load*`
- Documentation
  - Keep functions small with clear intent; add short comments where logic is non-obvious
  - Consider JSDoc typedefs for core models (Student, AttendanceRecord, Notification) in `api.js`
- DOM and UI
  - Guard DOM queries (`if (!el) return`)
  - Avoid duplicate script imports per page; prefer module imports and a single script entry per page
- Date/time
  - Represent “attendance date” as local `YYYY-MM-DD` (see `todayYmdLocal`)
  - Timestamps stored as ISO strings; be mindful of timezone when comparing
- Security
  - Do not hard-code Supabase keys in source; inject via `window.*` for local dev and do not commit secrets

## 5. Common Patterns
- Data Access Gateway
  - `ApiService` abstracts all persistence with online (Supabase) and offline (localStorage) paths
  - Always call the service from UI code; do not query Supabase directly in pages/components
- Realtime Subscriptions
  - `RealtimeService` wraps channel subscriptions; callback-based
- Notifications
  - `ui.js` provides `showNotification(message, type, timeout)`; used consistently for success/error/info
- Offline-first
  - On errors or no client, gracefully fallback to local storage with clear UX messaging
- Duplicate Prevention
  - Before inserting attendance, check `getAttendanceByStudentAndDate(studentId, date)`

## 6. Do's and Don'ts
- ✅ Do
  - Inject Supabase credentials via `window.SUPABASE_URL` and `window.SUPABASE_ANON_KEY` before loading `supabase-config.js`
  - Use `ApiService` for all CRUD and queries; keep UI/DOM scripts free of direct DB access
  - Validate RFID inputs with `validateRfidFormat` before processing
  - Check for existing attendance for the same student and date; insert at most once/day
  - Use `showNotification` to communicate status/errors to the user
  - Guard DOM operations (check element existence) and keep UI responsive (`setScanUiState`)
  - Keep schema and code contracts aligned; update both together
- ❌ Don’t
  - Don’t commit or hard-code Supabase keys; don’t expose secrets in repo or HTML
  - Don’t duplicate module script tags (e.g., avoid multiple `supabase-config.js` includes on the same page)
  - Don’t bypass `ApiService` from UI layers
  - Don’t introduce new localStorage keys without centralizing them in `LS_KEYS`
  - Don’t rely on UTC/local conversions implicitly; be explicit about date-only vs timestamp fields

## 7. Tools & Dependencies
- Core libraries
  - Supabase JS via CDN ESM: `@supabase/supabase-js`
  - Font Awesome for icons
  - Optional Bootstrap JS (attendance.html includes the bundle via CDN; CSS is not used site-wide)
- Setup instructions
  1) Static hosting or local dev
     - Serve `index.html` with a static server (e.g., VS Code Live Server) or open directly in a browser for quick checks
  2) Configure Supabase
     - Create a project and note the URL and anon key
     - Run `supabase/schema.sql` in the Supabase SQL editor
     - Storage: Create `avatars` bucket and apply the policies outlined in `schema.sql`
     - Realtime: Tables `attendance` and `student_sms` are added to `supabase_realtime`
  3) Credentials
     - Add a small, non-committed script block before `supabase-config.js` on each page that needs DB access:
       ```html
       <script>
         window.SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
         window.SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
       </script>
       ```
  4) Connectivity test
     - Open `src/html/test-supabase-connection.html` to verify read access to `students`

## 8. Other Notes
- Schema/contract alignment
  - `schema.sql` references `students.section` in an index and trigger, but the table definition omits a `section` column. Either:
    - Add `section text` to `public.students`, or
    - Remove `section` references (index and trigger logic) if unused
  - Field name consistency: code uses both `avatar` and `avatars`; `parent_phone` vs `parent_number`. Standardize to DB column names:
    - Students: `rfid`, `name`, `email`, `parent_phone`, `grade`, `section` (if used), `avatar`
  - Ensure UI forms map to these exact names when persisting
- Authentication
  - Current auth is client-only, localStorage-based and for demo purposes only. Do not assume any security. For production, integrate Supabase Auth and secure RLS policies accordingly
- Real-time channels
  - Wrap subscriptions in page lifecycle hooks and unsubscribe when leaving a page (if you add SPA-like routing)
- LLM guidance
  - Always route persistence through `ApiService`
  - Prefer pure functions for DOM rendering helpers to simplify future unit tests
  - Keep UX responsive and resilient to network failures; maintain clear user feedback via notifications
