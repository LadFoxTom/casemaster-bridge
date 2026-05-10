# @casemaster/admin — documentation site

This is **the docs for the package, hosted on the package's own runtime**:
a [cms-vercel](https://github.com/LadFoxTom/Casemaster-Vercel) project where
every page is a `.cms` file. Eating its own dog food.

Read it live at: _your deployed URL_

## What's inside

```
casemaster-cms-admin-site/
├── api/
│   └── index.ts                 cms-vercel entry (the Vercel function)
├── app/
│   ├── page/
│   │   ├── index.cms            landing — overview + cards
│   │   ├── cms-vercel.cms       install on a cms-vercel project
│   │   ├── dotnet.cms           use as a sidecar to CaseMaster.Web.exe
│   │   ├── iis.cms              IIS deployment (URL Rewrite + ARR)
│   │   ├── architecture.cms     architecture + request lifecycle
│   │   ├── api.cms              JSON API reference
│   │   ├── why.cms              market-research takeaways
│   │   ├── roadmap.cms          phase-by-phase status
│   │   └── faq.cms              FAQ
│   └── script/
│       └── _layout.cms          shared sidebar
├── public/static/css/app.css    custom doc styling
├── bin/
│   └── install-runtime.mjs      vendors cms-vercel from GitHub (postinstall)
├── package.json
├── vercel.json
└── LICENSE                       MIT
```

## Run it locally

```bash
git clone https://github.com/<you>/casemaster-cms-admin-site
cd casemaster-cms-admin-site
npm install                    # vendors cms-vercel automatically
npx vercel dev                 # http://localhost:3000
```

The first `npm install` clones the cms-vercel runtime from GitHub, builds it,
and drops the built artefact into `node_modules/cms-vercel`. cms-vercel isn't
published to npm yet — this is the path the upstream README documents as
"Path A · internal / pre-publish."

To upgrade later:

```bash
CMS_VERCEL_UPGRADE=1 npm install
```

To pin a specific commit:

```bash
CMS_VERCEL_REF=<sha> npm install
```

### Without git access (air-gapped CI)

Drop a pre-built `dist/` into `./vendor/cms-vercel/`, then:

```bash
CMS_VERCEL_VENDOR=1 npm install
```

## Deploy to Vercel

```bash
vercel --prod
```

That's it. The site is pure server-rendered HTML — no DB needed because the
docs pages don't iterate over BOs. If you want to demo the live data side
of cms-vercel from these docs, set `DATABASE_URL` in your Vercel env and
write `.cms` pages that use `iterator.ofEntity`.

## Push to a fresh GitHub repo

```bash
git init
git add .
git commit -m "initial docs site for @casemaster/admin"
gh repo create <org>/casemaster-cms-admin-site --public --source=. --push
```

## License

MIT — see [LICENSE](./LICENSE).
