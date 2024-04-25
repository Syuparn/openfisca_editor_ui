import { Button } from "@chakra-ui/button"
import { HStack, Text, VStack } from "@chakra-ui/layout"
import { Textarea } from "@chakra-ui/textarea"

function Prompt() {
  return (
    <VStack
      w='full'
    >
      <HStack>
        <Text>コードを修正したい場合にプロンプトを入力</Text>
        <Button>送信</Button>
      </HStack>
      <Textarea
        value={'以下レビューに従って修正してください。\n\n- `○○制度` で、配偶者がいる場合 `××控除` は加算されません。'}
        rows={20}
        height='auto'
      >
      </Textarea>
    </VStack>
  )
}

export default Prompt
