# Repository Guidelines

## Project Structure & Module Organization

The active application lives at the repository root and uses Next.js App Router.
Core UI and route files are under `src/app/`, with global CSS in
`src/app/globals.css` and static assets in `public/`. Project documentation is in
`README.md`, `docs/`, and `public/docs/`. Firebase configuration and security
files are kept at the root: `firebase.json`, `firestore.rules`, and
`firestore.indexes.json`. The nested `my-app/` directory is excluded by
`tsconfig.json` and should be treated as legacy or reference code unless a task
explicitly targets it.

## Build, Test, and Development Commands

- `npm install`: install root project dependencies from `package-lock.json`.
- `npm run dev`: start the Next.js dev server with Turbopack on port `9002`.
- `npm run build`: create a production Next.js build.
- `npm run start`: serve the production build after `npm run build`.
- `npm run lint`: run the lint command declared by the project.

Run commands from the repository root unless you are deliberately working inside
`my-app/`.

## Coding Style & Naming Conventions

Use TypeScript and React functional components. Keep indentation at two spaces,
prefer single quotes, and keep semicolons, matching the current `src/app` files.
Component names should be PascalCase, hooks should start with `use`, and local
variables/functions should use camelCase. Use the `@/*` path alias for imports
from `src/` when it improves readability. Keep styling consistent with the
existing Tailwind/global CSS setup, and avoid broad rewrites unrelated to the
change being made.

## Testing Guidelines

No dedicated test framework or test directory is currently configured. For now,
use `npm run build` as the main regression check and manually verify
`npm run dev` at `http://localhost:9002`. When adding tests, prefer colocated
`*.test.ts` or `*.test.tsx` files near the code under test and document any new
test command in `package.json`.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Fix globals.css and
tailwind.config.ts` or `Remove turbopack config from next.config.ts`. Follow that
style: describe the concrete change in one line, and keep unrelated edits out of
the commit.

Pull requests should include a brief purpose statement, key implementation
notes, verification steps run, and screenshots or screen recordings for visible
UI changes. Link issues when applicable.

## Security & Configuration Tips

Do not commit real secrets. Use `.env.local` for local Firebase values and keep
`.env.local.example` updated when configuration keys change. Review
`firestore.rules` whenever data access behavior changes.
