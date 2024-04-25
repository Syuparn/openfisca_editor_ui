import { Button } from "@chakra-ui/button"
import { Input } from "@chakra-ui/input"
import { HStack } from "@chakra-ui/layout"
import APIKey from "./APIKey"
import { geminiHandler } from "../gemini/gemini"
import { APIKeyContext } from "../contexts/apiKeyContext"
import { useContext } from "react"

function Settings() {
  const { apiKey } = useContext(APIKeyContext)

  const onClick = () => {
    const run = geminiHandler(apiKey)

    run('How many paws are in my house?').then((result: string) => {
      console.log(result)
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
