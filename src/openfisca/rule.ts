const contentCache= new Map<string, string>()

export async function fetchRulePage(url: string) {
  if (contentCache.has(url)) {
    return contentCache.get(url) as string
  }

  // HACK: CORS非対応でブロックされるのを防ぐためプロキシを利用
  const proxyURL = url.replace(/https:?\/\/[^//]+/, 'http://localhost:5173/proxy')

  console.log(proxyURL)
  const reponse = await fetch(proxyURL)
  const content = await reponse.text()

  if (content === undefined) {
    throw `content from "${url}" was empty`
  }

  contentCache.set(url, content)

  return content
}
