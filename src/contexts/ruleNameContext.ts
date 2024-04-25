import React from 'react'

type RuleNameState = {
  ruleName: string,
  setRuleName: React.Dispatch<React.SetStateAction<string>>,
}

export const RuleNameContext = React.createContext<RuleNameState>({ruleName: "", setRuleName: () => {}})
