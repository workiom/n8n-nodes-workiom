# Publishing to n8n

n8n community nodes are npm packages. Publishing to npm makes the node available in every n8n instance through the built-in community node installer.

## First-time publish

### 1. Create an npm account

Sign up at [npmjs.com](https://npmjs.com) if you don't have one.

### 2. Login from the terminal

```bash
cd n8n-nodes-workiom
npm login
```

Enter your npm username, password, and email when prompted.

### 3. Update `package.json`

Set the correct GitHub repository URL before publishing:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/workiom/workiom-n8n.git"
}
```

### 4. Build

```bash
npm run build
```

### 5. Publish

```bash
npm publish --access public
```

The package is live on npm within ~1 minute.

---

## Installing in n8n

Once published, any n8n user can install it:

> **Settings → Community Nodes → Install → `n8n-nodes-workiom`**

---

## Publishing updates

1. Bump the version in `package.json` (e.g. `0.1.0` → `0.1.1`)
2. Build and publish:

```bash
npm run build
npm publish
```

---

## Version guidelines

| Change type | Example | Version bump |
|---|---|---|
| Bug fix | Fix 401 on dropdown load | Patch `0.1.0 → 0.1.1` |
| New feature | Add new resource or operation | Minor `0.1.0 → 0.2.0` |
| Breaking change | Rename credential fields | Major `0.1.0 → 1.0.0` |
