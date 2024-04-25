import { Heading, VStack } from "@chakra-ui/layout"
import { Textarea } from "@chakra-ui/textarea"

function Result() {
  return (
    <VStack
      w='full'
    >
      <Heading size='md'>Result</Heading>
      <Textarea
        placeholder='生成結果がここに表示されます'
        rows={20}
        height='auto'
      >
      </Textarea>
    </VStack>
  )
}

export default Result
