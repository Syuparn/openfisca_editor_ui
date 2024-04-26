import { Button } from "@chakra-ui/button"
import { Input } from "@chakra-ui/input"
import { HStack } from "@chakra-ui/layout"
import APIKey from "./APIKey"
import { geminiHandler } from "../gemini/gemini"
import { APIKeyContext } from "../contexts/apiKeyContext"
import { useContext } from "react"
import { ResponseContext } from "../contexts/responseContext"
import { exampleSrc, getExampleData, instruction } from "../openfisca/example"
import { fetchRulePage } from "../openfisca/rule"
import { RuleURLContext } from "../contexts/ruleURLContext"
import { RuleNameContext } from "../contexts/ruleNameContext"
import { makePrompt } from "../openfisca/prompt"

function Settings() {
  const { apiKey } = useContext(APIKeyContext)
  const { setResponse } = useContext(ResponseContext)
  const { ruleURL } = useContext(RuleURLContext)
  const { ruleName } = useContext(RuleNameContext)

  const run = async(): Promise<void> => {
    const sendPrompt = geminiHandler(apiKey)

    const exampleRule = await getExampleData()
    const ruleContent = await fetchRulePage(ruleURL)

    const rule = {
      name: ruleName,
      content: ruleContent,
    }

    const prompt = makePrompt(exampleRule, exampleSrc, rule)

    const response = await sendPrompt(instruction, prompt)
    setResponse(response)
  }

  const onClick = () => {
    run().catch(e => {
      alert(`リクエスト中に予期せぬエラーが発生しました: ${e}`)
    })
  }

  return (
    <HStack
      w='full'
    >
      <Input
        placeholder='制度名を入力'
      >
      </Input>
      <Input
        placeholder='制度情報説明サイトのURLを入力'
      >
      </Input>
      <APIKey />
      <Button
        onClick={onClick}
      >
        実行
      </Button>
    </HStack>
  )
}

export default Settings
