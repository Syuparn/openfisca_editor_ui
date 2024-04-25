import { Button } from "@chakra-ui/button"
import { HStack, Text, VStack } from "@chakra-ui/layout"
import { Textarea } from "@chakra-ui/textarea"

function History() {
  return (
    <VStack
      w='full'
    >
      <HStack>
        <Button>取り込む</Button>
        <Text>生成結果を一時的に保存できます</Text>
        <Button>クリップボードにコピー</Button>
      </HStack>
      <Textarea
        placeholder='保存するとここに表示されます'
        rows={20}
        height='auto'
      >
      </Textarea>
    </VStack>
  )
}

export default History
