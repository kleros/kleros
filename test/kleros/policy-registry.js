/* globals artifacts, contract, expect */
const PolicyRegistry = artifacts.require('./kleros/PolicyRegistry.sol')

contract('PolicyRegistry', accounts =>
  it('Should let you create and delete subcourt policies.', async () => {
    // Deploy contract and generate policies
    const governor = accounts[0]
    const policyRegistry = await PolicyRegistry.new(governor)
    const policies = [
      {
        ID: 0,
        subcourtID: 0,
        fileURL: 'https://a.b.com',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000001'
      },
      {
        ID: 1,
        subcourtID: 0,
        fileURL: 'https://c.d.com',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000001'
      },
      {
        ID: 0,
        subcourtID: 1,
        fileURL: 'https://e.f.com',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000001'
      },
      {
        ID: 1,
        subcourtID: 1,
        fileURL: 'https://g.h.com',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000001'
      }
    ]

    // Create policies
    for (const policy of policies)
      await policyRegistry.createPolicy(
        policy.subcourtID,
        policy.fileURL,
        policy.fileHash
      )

    // Delete every policy and create it again
    for (const policy of policies) {
      await policyRegistry.deletePolicy(policy.subcourtID, policy.ID)
      await policyRegistry.createPolicy(
        policy.subcourtID,
        policy.fileURL,
        policy.fileHash
      )
    }

    // Verify policies were created correctly
    for (const policy of policies) {
      const _policy = await policyRegistry.policy(policy.subcourtID, policy.ID)
      expect(_policy[0]).to.equal(policy.fileURL)
      expect(_policy[1]).to.equal(policy.fileHash)
    }
  })
)
