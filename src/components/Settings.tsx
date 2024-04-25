import { Button } from "@chakra-ui/button"
import { Input } from "@chakra-ui/input"
import { HStack } from "@chakra-ui/layout"
import APIKey from "./APIKey"

function Settings() {
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
      <Button>
        実行
      </Button>
    </HStack>
  )
}

export default Settings
