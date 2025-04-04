# ERC-4626 Aave Strategy

## Mechanism

```
User → Vault → Strategy → Aave Pool
```

1. **Vault** receives user deposits and issues shares
2. **Strategy** takes funds from vault and deposits into Aave
3. **Aave Pool** generates yield on the deposits
4. **Strategy** tracks and reports yield back to vault
5. **Vault** allows users to withdraw principal + yield

## Key Components

- **AaveStrategy.sol**: Interacts with Aave, handles deposits/withdrawals
- **ERC-4626 Vault**: User-facing contract (implements tokenized vault standard)
- **Aave Integration**: Uses low-level calls for cross-version compatibility

## Flow of Funds

- Deposits: DAI → Vault → Strategy → Aave (receive aDAI)
- Yield: aDAI balance increases over time
- Withdrawals: aDAI → DAI → Strategy → Vault → User

## Security Features

- Access control with `onlyVault` modifier
- Emergency pause functionality
- Reentrancy protection