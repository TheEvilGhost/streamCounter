/**
 * Корень `/` отдаётся через middleware как rewrite на `/index.html`.
 * Эта страница нужна сборке Next; при отключённом middleware можно перейти по ссылке.
 */
export default function Home() {
  return (
    <main style={{ padding: "2rem", maxWidth: 480 }}>
      <p>
        <a href="/index.html">Открыть Stream Analyzer</a>
      </p>
      <p style={{ color: "#666", fontSize: 14 }}>
        На Vercel с паролем откройте главную страницу сайта — браузер запросит логин и пароль.
      </p>
    </main>
  );
}
