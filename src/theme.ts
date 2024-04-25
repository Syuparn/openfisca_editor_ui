//theme.ts
import { extendTheme } from "@chakra-ui/react";

export const theme = extendTheme({
  styles: {
    global: {
      body: {
        backgroundColor: 'black',
        color: 'white',
        fontFamily: 'monospace',
        padding: '0.5rem',
        paddingRight: '1rem',
      },
      html: {
        height: '100%',
      }
    }
  }
})
