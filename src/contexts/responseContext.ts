import React from 'react'

type ResponseState = {
  response: string,
  setResponse: React.Dispatch<React.SetStateAction<string>>,
}

export const ResponseContext = React.createContext<ResponseState>({response: "", setResponse: () => {}})
