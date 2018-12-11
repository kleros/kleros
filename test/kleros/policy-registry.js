/* globals artifacts, contract, expect */
const PolicyRegistry = artifacts.require('./kleros/PolicyRegistry.sol')

contract('PolicyRegistry', accounts =>
  it('Should let you set subcourt policies.', async () => {
    // Deploy contract and generate policies.
    const governor = accounts[0]
    const subcourtID = 0
    const policyRegistry = await PolicyRegistry.new(governor)
    const policies = [
      {
        fileURI: 'https://a.b.com',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000001'
      },
      {
        fileURI: 'https://c.d.com',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000002'
      },
      {
        fileURI: 'https://e.f.com',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000003'
      },
      {
        fileURI: 'https://g.h.com',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000004'
      }
    ]

    // Set policies.
    for (const policy of policies)
      await policyRegistry.setPolicy(
        subcourtID,
        policy.fileURI,
        policy.fileHash
      )

    // Verify policy update events were emitted.
    expect(
      (await new Promise((resolve, reject) =>
        policyRegistry
          .PolicyUpdate({ _subcourtID: subcourtID }, { fromBlock: 0 })
          .get((err, logs) => (err ? reject(err) : resolve(logs)))
      )).map(e => ({ fileURI: e.args._fileURI, fileHash: e.args._fileHash }))
    ).to.deep.equal([
      {
        fileURI: '',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000000'
      },
      ...policies.slice(0, policies.length - 1)
    ])

    // Verify the last policy is set.
    const lastPolicy = policies[policies.length - 1]
    const policy = await policyRegistry.policies(subcourtID)
    expect(policy[0]).to.equal(lastPolicy.fileURI)
    expect(policy[1]).to.equal(lastPolicy.fileHash)
  })
)
