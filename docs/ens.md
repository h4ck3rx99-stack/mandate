# ENSv2 deployment (Sepolia)

Generated from data/ens.json by scripts/ens-setup.mts + scripts/ens-grants.mts. ENS is used for **discovery**; the payment service never trusts ENS records as proof.

| Item | Address | Tx |
|---|---|---|
| resolver.treasury | [0xb1E87dFf3B7E5bD8D0eACE1390459c39D054Fbc2](https://sepolia.etherscan.io/address/0xb1E87dFf3B7E5bD8D0eACE1390459c39D054Fbc2) | [deploy](https://sepolia.etherscan.io/tx/0xcd997ac4ba4e7d266b42ed71dd46d62e3a1947f9bbc424dca4f0a8b90f9be73a) |
| resolver.ops | [0xDC4c7335AE013E88436F8a3F5fb09303230dbcaB](https://sepolia.etherscan.io/address/0xDC4c7335AE013E88436F8a3F5fb09303230dbcaB) | [deploy](https://sepolia.etherscan.io/tx/0x57ce8f4917a18f3f2b109971c90f0a7f2c9e5aed55e7fa565ce5a4eee4f92a89) |
| resolver.procure | [0x4796b93c88498cbc2502783D26c9BBE79817AdbB](https://sepolia.etherscan.io/address/0x4796b93c88498cbc2502783D26c9BBE79817AdbB) | [deploy](https://sepolia.etherscan.io/tx/0x89c516043e8fff62c5a70972cb99afe3534759ee0e8b51b86aa374d8a3ca388a) |
| resolver.settle | [0xE7B64C4CE066DE749345cB612393d075c521a50c](https://sepolia.etherscan.io/address/0xE7B64C4CE066DE749345cB612393d075c521a50c) | [deploy](https://sepolia.etherscan.io/tx/0x5906fb4eb74f51c89086954d53da07a509463d14544966c1acf7cf314ac95b5e) |
| registry.mandate | [0xF561d0707fCCA71554C174cD0ec0b6A93fc94D4E](https://sepolia.etherscan.io/address/0xF561d0707fCCA71554C174cD0ec0b6A93fc94D4E) | [deploy](https://sepolia.etherscan.io/tx/0xc22f0a1d359fe282dd0f549d6171c427fe8d89be3d2e60ca655c9dac235098fe) |
| registry.treasury | [0x04a677b7E7757508B4440D0bC88120a60Bbed545](https://sepolia.etherscan.io/address/0x04a677b7E7757508B4440D0bC88120a60Bbed545) | [deploy](https://sepolia.etherscan.io/tx/0xdfe9cc21e1655f253bbab8d9aa7ef1c5ee2dd4e4f84ff6e0566473c2aa33a11e) |
| registry.ops | [0xf2019fF6291cD94644Ad609C53a6C6455a2B3503](https://sepolia.etherscan.io/address/0xf2019fF6291cD94644Ad609C53a6C6455a2B3503) | [deploy](https://sepolia.etherscan.io/tx/0xf275b809517580693f4edd74741e4273204fc6debb0fc37c599ab3e02121e0f6) |
| registry.procure | [0xbFfB4B6ea1B3F3F838E8090bA3FfD4963d6247FC](https://sepolia.etherscan.io/address/0xbFfB4B6ea1B3F3F838E8090bA3FfD4963d6247FC) | [deploy](https://sepolia.etherscan.io/tx/0x08063dab89ab44237ab22ba27af4cff9967278fdb6e68845ea3c29ec860cab76) |

| Name | Owner | Registered by tx |
|---|---|---|
| treasury.mandate.eth | 0x1d8a886CB0df503e7b21805048395ef7Fc98b586 | [tx](https://sepolia.etherscan.io/tx/0x42176a830c99e18622d1ef227d3afc6d1f77c58b3678a41fc7004c3954e47103) |
| ops.treasury.mandate.eth | 0xA93eC13999788cd84697E5c08A8BF050104c42c5 | [tx](https://sepolia.etherscan.io/tx/0xe69fa4fa8393ea85665d0575686b7826fbdda5974ef5b26eaaeda3092b49bd40) |
| procure.ops.treasury.mandate.eth | 0xee9970338AB26f5F7299d70A82924310Bb499d71 | [tx](https://sepolia.etherscan.io/tx/0xf096257079e4877b7320a8a0de7c58473b812dc3719ec7377b605785047b3a90) |
| settle.procure.ops.treasury.mandate.eth | 0xf1Caa96733356a666126a3AE02703E39d050E0cb | [tx](https://sepolia.etherscan.io/tx/0x176d6af8a6e5f2b830181ac6f521e920a20d9a04e1ae445eedaffcb78be59d43) |

mandate.eth subregistry attached: [tx](https://sepolia.etherscan.io/tx/0x8ffd9cbe148aaa269fe28356a8841895c1ba35e3605a08fb8fd5857d5f7a23cf)

Permissions (PermissionedResolver, admin OWNER): each agent may write only `mandate:status` on its own name; each issuer may write only `mandate:delegation-id`, `mandate:parent-id`, `mandate:delegation-uri` on its subject's name.
