import { Flex, Heading, Spacer, VStack } from '@chakra-ui/layout'
import './App.css'
import Result from './components/Result'
import Widgets from './components/Widgets'
import Settings from './components/Settings'

function App() {
  return (
    <>
      <VStack
        w='full'
      >
        <Heading>OpenFisca Editor (prototype)</Heading>
        <Spacer />
        <Settings />
        <Spacer />
        <Flex
          padding='1rem'
          justify='center'
          w='full'
        >
          <Result />
          <Widgets />
        </Flex>
      </VStack>
    </>
  )
}

export default App
