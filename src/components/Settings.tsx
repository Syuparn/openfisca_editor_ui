import { Button } from "@chakra-ui/button"
import { Input } from "@chakra-ui/input"
import { HStack } from "@chakra-ui/layout"
import APIKey from "./APIKey"
import { geminiHandler } from "../gemini/gemini"
import { APIKeyContext } from "../contexts/apiKeyContext"
import { useContext } from "react"
import { ResponseContext } from "../contexts/responseContext"

function Settings() {
  const { apiKey } = useContext(APIKeyContext)
  const { setResponse } = useContext(ResponseContext)

  const run = async(): Promise<void> => {
    const sendPrompt = geminiHandler(apiKey)
    const prompt = 'How many paws are in my house?'

    const response = await sendPrompt(prompt)
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
