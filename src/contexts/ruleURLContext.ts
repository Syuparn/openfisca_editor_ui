import React from 'react'

type RuleURLState = {
  ruleURL: string,
  setRuleURL: React.Dispatch<React.SetStateAction<string>>,
}

export const RuleURLContext = React.createContext<RuleURLState>({ruleURL: "", setRuleURL: () => {}})
