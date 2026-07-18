# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

---

## 🏷️ White-Label / Branding Feature

The platform supports full white-label customization via the **BrandingContext** (`src/context/BrandingContext.tsx`).

### What can be customized?

| Setting | Description | Where it appears |
|---|---|---|
| **Company Name** | Your brand name | Sidebar, login page, browser tab title, footer |
| **Logo** | URL to your logo image | Login page, sidebar header |
| **Favicon** | Browser tab icon | Browser tabs & bookmarks |
| **Primary Color** | Brand hex color | Buttons, links, highlights, sidebar accent — auto-generates a full palette (`--primary-50` through `--primary-700`) |
| **Login Text** | Subtitle on login page | Below the company name on `/login` and `/vendor/login` |
| **Support Email** | Contact address | Footer and login page |

### How to configure

1. Go to **Admin → Company Settings → Branding** tab
2. Fill in the fields (changes are dirty-checked — "Save Branding" button only appears when something changes)
3. Click **Save Branding** — changes apply immediately across the entire app

### Architecture

- `BrandingContext` loads the `CompanyProfile` from backend on mount
- Generates a full CSS custom property palette from the primary color using white/black blending
- Applies CSS vars to `document.documentElement.style`, overrides favicon, and sets document title
- Falls back gracefully to defaults (`#0a6ed1`, name "Heliflow") if the API call fails
- The `useBranding()` hook provides access in any component: `const { companyName, logoUrl, primaryColor, ... } = useBranding();`
