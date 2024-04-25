import { Heading, VStack } from "@chakra-ui/layout"
import { Textarea } from "@chakra-ui/textarea"
import { useContext } from "react"
import { ResponseContext } from "../contexts/responseContext"

function Result() {
  const { response } = useContext(ResponseContext)

  return (
    <VStack
      w='full'
    >
      <Heading size='md'>Result</Heading>
      <Textarea
        placeholder='生成結果がここに表示されます'
        value={response}
        rows={20}
        height='auto'
        readOnly={true}
      >
      </Textarea>
    </VStack>
  )
}

export default Result
