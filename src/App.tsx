import { Flex, Heading, Spacer, VStack } from '@chakra-ui/layout'
import './App.css'
import Result from './components/Result'
import Widgets from './components/Widgets'
import Settings from './components/Settings'
import { useState } from 'react'
import { APIKeyContext } from './contexts/apiKeyContext'
import { ResponseContext } from './contexts/responseContext'
import { RuleNameContext } from './contexts/ruleNameContext'
import { RuleURLContext } from './contexts/ruleURLContext'

function App() {
  const [apiKey, setAPIKey] = useState('')
  const [ruleName, setRuleName] = useState('')
  const [ruleURL, setRuleURL] = useState('')
  const [response, setResponse] = useState('')

  return (
    <>
      <APIKeyContext.Provider value={{apiKey, setAPIKey}}>
      <RuleNameContext.Provider value={{ruleName, setRuleName}}>
      <RuleURLContext.Provider value={{ruleURL, setRuleURL}}>
      <ResponseContext.Provider value={{response, setResponse}}>
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
      </ResponseContext.Provider>
      </RuleURLContext.Provider>
      </RuleNameContext.Provider>
      </APIKeyContext.Provider>
    </>
  )
}

export default App
