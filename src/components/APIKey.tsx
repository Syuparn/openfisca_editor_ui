import { Button } from "@chakra-ui/button"
import { useDisclosure } from "@chakra-ui/hooks"
import { Input } from "@chakra-ui/input"
import { Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerFooter, DrawerHeader, DrawerOverlay } from "@chakra-ui/modal"
import { useContext, useRef } from "react"
import { APIKeyContext } from "../contexts/apiKeyContext"

function APIKey() {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const btnRef = useRef(null)
  const { setAPIKey } = useContext(APIKeyContext)

  return (
    <>
      <Button ref={btnRef} onClick={onOpen}>
        APIKey
      </Button>
      <Drawer
        isOpen={isOpen}
        placement='right'
        onClose={onClose}
        finalFocusRef={btnRef}
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>APIキーを指定してください</DrawerHeader>
          <DrawerBody>
            <Input
              placeholder='API Key'
              color='black'
              onChange={(e) => setAPIKey(e.target.value)}
            />
          </DrawerBody>
          <DrawerFooter>
            <Button colorScheme='blue' onClick={onClose}>Save</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>

  )
}

export default APIKey
