import { Heading, VStack } from "@chakra-ui/layout"
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "@chakra-ui/tabs"
import Prompt from "./Prompt"
import History from "./History"
import Test from "./Test"

function Widgets() {
  return (
    <VStack
      w='full'
    >
      <Tabs
        w='full'
      >
        <TabList>
          <Tab>
            <Heading size='md'>Prompt</Heading>
          </Tab>
          <Tab>
            <Heading size='md'>History</Heading>
          </Tab>
          <Tab>
            <Heading size='md'>Test</Heading>
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <Prompt />
          </TabPanel>
          <TabPanel>
            <History />
          </TabPanel>
          <TabPanel>
            <Test />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  )
}

export default Widgets
