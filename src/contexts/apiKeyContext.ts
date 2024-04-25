import React from 'react'

type APIKeyState = {
  apiKey: string,
  setAPIKey: React.Dispatch<React.SetStateAction<string>>,
}

export const APIKeyContext = React.createContext<APIKeyState>({apiKey: "", setAPIKey: () => {}})
