const contentCache= new Map<string, string>()

export async function fetchRulePage(url: string) {
  if (contentCache.has(url)) {
    return contentCache.get(url)
  }
  const reponse = await fetch(url)
  const content = await reponse.text()

  contentCache.set(url, content)

  return content
}
