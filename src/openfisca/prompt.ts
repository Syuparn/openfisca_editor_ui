import dedent from 'dedent'

export type RuleData = {
  name: string
  content: string
}

export function makePrompt(exampleData: RuleData, exampleSrc: string, data: RuleData) {
  return dedent`
    制度情報をもとにソースコードを生成してください。

    制度情報: 「${exampleData.name}」

    \`\`\`
    ${exampleData.content}
    \`\`\`

    ソースコード:

    \`\`\`
    ${exampleSrc}
    \`\`\`

    制度情報: 「${data.name}」

    \`\`\`
    ${data.content}
    \`\`\`

    ソースコード:
  `
}
