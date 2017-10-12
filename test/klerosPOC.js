const { expectThrow, waitForMined, increaseTime } = require('kleros-interaction/helpers/utils')
const KlerosPOC = artifacts.require('./KlerosPOC.sol')
const Pinakion = artifacts.require('./PinakionPOC.sol')
const ArbitrableTransaction = artifacts.require('kleros-interaction/ArbitrableTransaction.sol')
const ConstantRandom = artifacts.require('kleros-interaction/ConstantNG.sol')


contract('KlerosPOC', function(accounts) {
    
    let creator = accounts[0]
    let jurorA  = accounts[1]
    let jurorB  = accounts[2]
    let jurorC  = accounts[3]
    let other   = accounts[4]
    let payer   = accounts[5]
    let payee   = accounts[6]
    let gasPrice = 5000000000
    
    
    
    // Constructor
    it("Should create the contract with the initial values", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[2,4,8,2,5],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        
        assert.equal(await klerosPOC.pinakion(), pinakion.address, "The PNK address did not setup properly.")
        assert.equal(await klerosPOC.rng(), rng.address, "The RNG address did not setup properly.")
        assert.equal(await klerosPOC.timePerPeriod(2), 8, "The time period did not setup properly.")
    })
    
    // **************************** //
    // *  Functions interacting   * //
    // *  with Pinakion contract  * //
    // **************************** //
    
    // deposit TODO
    it("Should deposit tokens to the contract", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})
        await klerosPOC.withdraw(0.8e18,{from:jurorA})
        await pinakion.deposit(0.4e18,{from:jurorA})

        assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 0.6e18, "The juror don't have the correct amount of PNK in Kleros.")
        assert.equal((await pinakion.balanceOf(jurorA)).toNumber(), 0.4e18, "The juror don't have the correct amount of PNK in the token contract.")
    })
    
    // withdraw
    it("Should decrease the balance in the kleros contract and increase it in the pinakion contract", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})
        await klerosPOC.withdraw(0.8e18,{from:jurorA})
        
        assert.equal((await klerosPOC.jurors(jurorA))[0], 0.2e18, "The juror don't have the correct amount of PNK in Kleros.")
        assert.equal((await pinakion.balanceOf(jurorA)), 0.8e18, "The juror don't have the correct amount of PNK in the token contract.")
    })
    
    it("Should not be possible to withdraw more than what we have", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})
        
        await expectThrow(klerosPOC.withdraw(1.8e18,{from:jurorA}))
    })
    
    // buyPinakion
    it("Should increase the balance of the juror", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})     
        
        assert.equal((await klerosPOC.jurors(jurorA))[0], 1e18, "The juror don't have the correct amount of PNK in Kleros.")
    })
    
    // **************************** //
    // *      Court functions     * //
    // **************************** //
    
    // passPeriod
    it("Should be able to pass all periods when the time has passed but not before", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[20,0,80,20,50],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        
        assert.equal(await klerosPOC.period(), 0)
        
        increaseTime(10)
        await expectThrow(klerosPOC.passPeriod({from:other}))
        increaseTime(11)
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 1)
        
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 2)
        
        increaseTime(10)
        await expectThrow(klerosPOC.passPeriod({from:other}))
        increaseTime(71)
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 3)
        
        increaseTime(10)
        await expectThrow(klerosPOC.passPeriod({from:other}))
        increaseTime(11)
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 4)
        
        increaseTime(10)
        await expectThrow(klerosPOC.passPeriod({from:other}))
        increaseTime(41)
        await klerosPOC.passPeriod({from:other})
        assert.equal(await klerosPOC.period(), 0)
        assert.equal(await klerosPOC.session(), 2)
    })
    
    // activateTokens
    it("Should activate the tokens and compute the segments correctly", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.buyPinakion({from:jurorB,value:1.4e18})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        await klerosPOC.activateTokens(1.4e18,{from:jurorB})
        
        assert.equal((await klerosPOC.jurors(jurorA))[2], 1, "The juror A lastSession is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorA))[3], 0, "The juror A start segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorA))[4], 1.2e18, "The juror A end segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[3], 1.2e18, "The juror B start segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[4], 2.6e18, "The juror B end segment is incorrect.")
        assert.equal(await klerosPOC.segmentSize(), 2.6e18, "The segment size is incorrect.")
    })
    
    it("Should activate the tokens and compute the segments correctly at the second session", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.buyPinakion({from:jurorB,value:1.4e18})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        await klerosPOC.activateTokens(1.4e18,{from:jurorB})
        
        for (let i = 0; i < 5; i++) 
            await klerosPOC.passPeriod({from:other})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        await klerosPOC.activateTokens(1.4e18,{from:jurorB})
        
        assert.equal((await klerosPOC.jurors(jurorA))[2], 2, "The juror A lastSession is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorA))[3], 0, "The juror A start segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorA))[4], 1.2e18, "The juror A end segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[3], 1.2e18, "The juror B start segment is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[4], 2.6e18, "The juror B end segment is incorrect.")
        assert.equal(await klerosPOC.segmentSize(), 2.6e18, "The segment size is incorrect.")
        
    })
    
    it("Should not be possible to activate too much", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await expectThrow(klerosPOC.activateTokens(1.3e18,{from:jurorA}))
    })
    
    it("Should not be possible to activate outside activation period", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.passPeriod({from:other})
        await expectThrow(klerosPOC.activateTokens(1.2e18,{from:jurorA}))
    })
    
    it("Should not be possible to activate multiple times", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.2e18})
        await klerosPOC.activateTokens(1.2e18,{from:jurorA})
        await expectThrow(klerosPOC.activateTokens(1.2e18,{from:jurorA}))
    })
    
    // voteRuling
    it("Should be able to vote and update the state accordingly (single juror)", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.2e18})
        await klerosPOC.activateTokens(0.2e18,{from:jurorA})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        
        let jurorABalanceBeforeVote = web3.eth.getBalance(jurorA)
        let tx = await klerosPOC.voteRuling(0, 1, [1,2,3],{from:jurorA,gasPrice:gasPrice})
        let txFee=tx.receipt.gasUsed*gasPrice
        let jurorABalanceAfterVote = web3.eth.getBalance(jurorA)
        
        assert.equal((jurorABalanceBeforeVote.toNumber()+arbitrationFee.toNumber()-txFee),jurorABalanceAfterVote.toNumber(), "The juror has not been paid correctly")
        let stakePerWeight = (await klerosPOC.minActivatedToken())*(await klerosPOC.alpha())/(1e4)
        assert.equal((await klerosPOC.jurors(jurorA))[1], 3*stakePerWeight, "The amount of token at stake is incorrect.")
        assert.equal(await klerosPOC.getVoteAccount(0,0,2), jurorA, "The address in the vote is incorrect.")
        assert.equal(await klerosPOC.getVoteRuling(0,0,2), 1, "The ruling in the vote is incorrect.")
        assert.equal(await klerosPOC.getWinningChoice(0,0), 1, "The current winning choice is incorrect.")
        assert.equal(await klerosPOC.getWinningCount(0,0), 3, "The current winning count is incorrect.")
        assert.equal(await klerosPOC.getVoteCount(0,0,1), 3, "The vote count is incorrect.")
    })
    
    it("Should not be possible to vote with extra weight", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.2e18})
        await klerosPOC.activateTokens(0.2e18,{from:jurorA})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        
        await expectThrow(klerosPOC.voteRuling(0, 1, [1,2,3,4],{from:jurorA}))
        await expectThrow(klerosPOC.voteRuling(0, 1, [1,2,2,3],{from:jurorA}))
    })
    
    it("Should not be possible to vote before draws", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.2e18})
        await klerosPOC.activateTokens(0.2e18,{from:jurorA})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        await expectThrow(klerosPOC.voteRuling(0, 1, [1],{from:jurorA}))
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await expectThrow(klerosPOC.voteRuling(0, 1, [1],{from:jurorA}))
        await klerosPOC.passPeriod({from:other})
    })
    
    it("Should be able to vote and update the state accordingly (multiple jurors)", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.4e18})
        await klerosPOC.activateTokens(0.4e18,{from:jurorA})
        await klerosPOC.buyPinakion({from:jurorB,value:0.6e18})
        await klerosPOC.activateTokens(0.6e18,{from:jurorB})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        
        let drawA=[]
        let drawB=[]
        for (let i = 1; i <= 3; i++) {
            if(await klerosPOC.isDrawn(0, jurorA, i))
                drawA.push(i)
            else   
                drawB.push(i)
        }
        // Note that it should work for every case, even if the same juror is drawn thrice.
        
        await klerosPOC.voteRuling(0, 1, drawA,{from:jurorA})
        await klerosPOC.voteRuling(0, 1, drawB,{from:jurorB})
        
        let stakePerWeight = (await klerosPOC.minActivatedToken())*(await klerosPOC.alpha())/(1e4)
        assert.equal((await klerosPOC.jurors(jurorA))[1], (drawA.length)*stakePerWeight, "The amount of token at stake for juror A is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[1], (drawB.length)*stakePerWeight, "The amount of token at stake for juror B is incorrect.")
        assert.equal((await klerosPOC.getWinningChoice(0,0)).toNumber(), 1, "The current winning choice is incorrect.")
        assert.equal((await klerosPOC.getWinningCount(0,0)).toNumber(), 3, "The current winning count is incorrect.")
        assert.equal((await klerosPOC.getVoteCount(0,0,1)).toNumber(), 3, "The vote count is incorrect.")
    })
    
    // penalizeInactiveJuror
    it("Should be possible to penalize a juror who did not vote after votes but not before", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.8e18})
        await klerosPOC.activateTokens(0.8e18,{from:jurorA})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        await expectThrow(klerosPOC.penalizeInactiveJuror(jurorA,0, [1,2,3],{from:jurorC})) // The votes hasn't finished yet, so it should not be possible to penalize.
        await klerosPOC.passPeriod({from:other}) 
        await klerosPOC.penalizeInactiveJuror(jurorA,0, [1,2,3],{from:jurorC}) // Now we should be able to penalize.
        
        let stakePerWeight = (await klerosPOC.minActivatedToken())*(await klerosPOC.alpha())/(1e4)
        assert.equal((await klerosPOC.jurors(jurorA))[0], 0.8e18-6*stakePerWeight, "The amount of token at stake is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorC))[0], 3*stakePerWeight, "The amount of token at stake is incorrect.")
    })
    
    it("Should take all the balance if the balance is too low, in case of penalization", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.1e18})
        await klerosPOC.activateTokens(0.1e18,{from:jurorA})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        for (let i = 0; i < 3; i++) // Go up to after the vote.
            await klerosPOC.passPeriod({from:other}) 
        await klerosPOC.penalizeInactiveJuror(jurorA,0, [1,2,3],{from:jurorC}) // Now we should be able to penalize.
        
        
        assert.equal((await klerosPOC.jurors(jurorA))[0], 0, "The amount of token at stake is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorC))[0], 0.05e18, "The amount of token at stake is incorrect.")
    })
    
    it("Should not be possible to penalize a juror who voted", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.2e18})
        await klerosPOC.activateTokens(0.2e18,{from:jurorA})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        await klerosPOC.voteRuling(0, 1, [1,2,3],{from:jurorA})
        await klerosPOC.passPeriod({from:other})
        await expectThrow(klerosPOC.penalizeInactiveJuror(jurorA,0, [1,2,3],{from:jurorC}))
        
    })
    
    // oneShotTokenRepartition
    it("Should realocate tokens correctly", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.4e18})
        await klerosPOC.activateTokens(0.4e18,{from:jurorA})
        await klerosPOC.buyPinakion({from:jurorB,value:0.6e18})
        await klerosPOC.activateTokens(0.6e18,{from:jurorB})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        
        let drawA=[]
        let drawB=[]
        for (let i = 1; i <= 3; i++) {
            if(await klerosPOC.isDrawn(0, jurorA, i))
                drawA.push(i)
            else   
                drawB.push(i)
        }
        // Note that it should work for every case, even if the same juror is drawn thrice.
        
        await klerosPOC.voteRuling(0, 1, drawA,{from:jurorA})
        await klerosPOC.voteRuling(0, 2, drawB,{from:jurorB})
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to execution.
        await klerosPOC.passPeriod({from:other})
        await klerosPOC.oneShotTokenRepartition(0,{from:other})
        
        
        let stakePerWeight = (await klerosPOC.minActivatedToken())*(await klerosPOC.alpha())/(1e4)     
        
        assert.equal((await klerosPOC.jurors(jurorA))[1].toNumber(), 0, "The amount of token at stake for juror A is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[1].toNumber(), 0, "The amount of token at stake for juror B is incorrect.")
        if (drawA.length>drawB.length) {
            assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 0.4e18+drawB.length*stakePerWeight, "The balance of juror A has not been updated correctly.")
            assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 0.6e18-drawB.length*stakePerWeight, "The balance of juror B has not been updated correctly.")
        } else {
            assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 0.4e18-drawA.length*stakePerWeight, "The balance of juror A has not been updated correctly.")
            assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 0.6e18+drawA.length*stakePerWeight, "The balance of juror B has not been updated correctly.")
        }
    })
    
    it("Should not be possible to call execution before or do it multiple times", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.4e18})
        await klerosPOC.activateTokens(0.4e18,{from:jurorA})
        await klerosPOC.buyPinakion({from:jurorB,value:0.6e18})
        await klerosPOC.activateTokens(0.6e18,{from:jurorB})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        await expectThrow(klerosPOC.oneShotTokenRepartition(0,{from:other}))
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await expectThrow(klerosPOC.oneShotTokenRepartition(0,{from:other}))
        await klerosPOC.passPeriod({from:other})
        
        let drawA=[]
        let drawB=[]
        for (let i = 1; i <= 3; i++) {
            if(await klerosPOC.isDrawn(0, jurorA, i))
                drawA.push(i)
            else   
                drawB.push(i)
        }
        
        await klerosPOC.voteRuling(0, 1, drawA,{from:jurorA})
        await klerosPOC.voteRuling(0, 2, drawB,{from:jurorB})
        await expectThrow(klerosPOC.oneShotTokenRepartition(0,{from:other}))
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to execution.
        await expectThrow(klerosPOC.oneShotTokenRepartition(0,{from:other}))
        await klerosPOC.passPeriod({from:other})
        await klerosPOC.oneShotTokenRepartition(0,{from:other})
        await expectThrow(klerosPOC.oneShotTokenRepartition(0,{from:other}))
        await klerosPOC.passPeriod({from:other})
        await expectThrow(klerosPOC.oneShotTokenRepartition(0,{from:other}))
        await klerosPOC.passPeriod({from:other})
        await expectThrow(klerosPOC.oneShotTokenRepartition(0,{from:other}))
    })
    
    it("Should realocate tokens correctly (when appeal)", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1.4e18})
        await klerosPOC.activateTokens(1.4e18,{from:jurorA})
        await klerosPOC.buyPinakion({from:jurorB,value:1.6e18})
        await klerosPOC.activateTokens(1.6e18,{from:jurorB})
        await klerosPOC.buyPinakion({from:jurorC,value:1.5e18})

        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        
        let drawAInitial=[]
        let drawBInitial=[]
        for (let i = 1; i <= 3; i++) {
            if(await klerosPOC.isDrawn(0, jurorA, i))
                drawAInitial.push(i)
            else   
                drawBInitial.push(i)
        }
        // Note that it should work for every case, even if the same juror is drawn thrice.
        
        await klerosPOC.voteRuling(0, 1, drawAInitial,{from:jurorA})
        await klerosPOC.voteRuling(0, 2, drawBInitial,{from:jurorB})
        
        await klerosPOC.passPeriod({from:other}) // Pass once to go to appeal.
        let appealFee = await klerosPOC.appealCost(0,0x0)
        arbitrableTransaction.appeal(0x0,{from:payee,value:appealFee})
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to activation.
        await klerosPOC.passPeriod({from:other})

        await klerosPOC.activateTokens(1.4e18,{from:jurorA})
        await klerosPOC.activateTokens(1.5e18,{from:jurorC})
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        
        let drawAAppeal=[]
        let drawCAppeal=[]
        for (let i = 1; i <= 3; i++) {
            if(await klerosPOC.isDrawn(0, jurorA, i))
                drawAAppeal.push(i)
            else   
                drawCAppeal.push(i)
        }
        
        await klerosPOC.voteRuling(0, 1, drawAAppeal,{from:jurorA})
        await klerosPOC.voteRuling(0, 2, drawCAppeal,{from:jurorC})
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to execution.
        await klerosPOC.passPeriod({from:other})
        await klerosPOC.oneShotTokenRepartition(0,{from:other})
        
        assert.equal((await klerosPOC.jurors(jurorA))[1].toNumber(), 0, "The amount of token at stake for juror A is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorB))[1].toNumber(), 0, "The amount of token at stake for juror B is incorrect.")
        assert.equal((await klerosPOC.jurors(jurorC))[1].toNumber(), 0, "The amount of token at stake for juror C is incorrect.")
        let stakePerWeight = (await klerosPOC.minActivatedToken())*(await klerosPOC.alpha())/(1e4)
        if (drawAAppeal.length>drawCAppeal.length) { // Payer wins. So juror A is coherant.
            assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 1.4e18+(drawCAppeal.length+drawBInitial.length)*stakePerWeight, "The balance of juror A has not been updated correctly.")
            assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 1.6e18-drawBInitial.length*stakePerWeight, "The balance of juror B has not been updated correctly.")
            assert.equal((await klerosPOC.jurors(jurorC))[0].toNumber(), 1.5e18-drawCAppeal.length*stakePerWeight, "The balance of juror C has not been updated correctly.")
        } else { // Payee wins. So juror B and C are coherant.
            assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 1.4e18-(drawAAppeal.length+drawAInitial.length)*stakePerWeight, "The balance of juror A has not been updated correctly.")
            assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 1.6e18+(drawBInitial.length>0)*drawAInitial.length*stakePerWeight, "The balance of juror B has not been updated correctly.")
            assert.equal((await klerosPOC.jurors(jurorC))[0].toNumber(), 1.5e18+(drawCAppeal.length>0)*drawAAppeal.length*stakePerWeight, "The balance of juror C has not been updated correctly.")
        } 
    })
    
    // **************************** //
    // *   Arbitrator functions   * //
    // **************************** //
    
    // createDispute
    it("Should schedule disputes correctly", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.4e18})
        await klerosPOC.activateTokens(0.4e18,{from:jurorA})
        await klerosPOC.buyPinakion({from:jurorB,value:0.6e18})
        await klerosPOC.activateTokens(0.6e18,{from:jurorB})
        await klerosPOC.buyPinakion({from:jurorC,value:0.5e18})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        assert.equal((await klerosPOC.disputes(0))[1],1, "The dispute raised before draws was scheduled incorrectly")
        
        await klerosPOC.passPeriod({from:other}) // Pass to draw period.
        
        let arbitrableTransactionPostDraw = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        await arbitrableTransactionPostDraw.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransactionPostDraw.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        assert.equal((await klerosPOC.disputes(1))[1],2, "The dispute raised after draws was scheduled incorrectly")
        
    })
    
    // appeal
    it("Should be possible to appeal during the appeal period but not outside or without paying the fee", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.4e18})
        await klerosPOC.activateTokens(0.4e18,{from:jurorA})
        await klerosPOC.buyPinakion({from:jurorB,value:0.6e18})
        await klerosPOC.activateTokens(0.6e18,{from:jurorB})
        await klerosPOC.buyPinakion({from:jurorC,value:0.5e18})
        let appealFee = 7*(await klerosPOC.arbitrationFeePerJuror())
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        expectThrow(arbitrableTransaction.appeal(0x0,{from:payee,value:appealFee}))
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        expectThrow(arbitrableTransaction.appeal(0x0,{from:payee,value:appealFee}))
        await klerosPOC.passPeriod({from:other})
        
        let drawAInitial=[]
        let drawBInitial=[]
        for (let i = 1; i <= 3; i++) {
            if(await klerosPOC.isDrawn(0, jurorA, i))
                drawAInitial.push(i)
            else   
                drawBInitial.push(i)
        }
        // Note that it should work for every case, even if the same juror is drawn thrice.
        expectThrow(arbitrableTransaction.appeal(0x0,{from:payee,value:appealFee}))
        await klerosPOC.voteRuling(0, 1, drawAInitial,{from:jurorA})
        await klerosPOC.voteRuling(0, 2, drawBInitial,{from:jurorB})
        expectThrow(arbitrableTransaction.appeal(0x0,{from:payee,value:appealFee}))
        await klerosPOC.passPeriod({from:other}) // Pass once to go to appeal.
        
        expectThrow(arbitrableTransaction.appeal(0x0,{from:payee,value:appealFee-100}))
        await arbitrableTransaction.appeal(0x0,{from:payee,value:appealFee})
        expectThrow(arbitrableTransaction.appeal(0x0,{from:payee,value:appealFee}))
        
    })
    
    // executeRuling
    it("Should refund the payer", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new(10,{from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:0.4e18})
        await klerosPOC.activateTokens(0.4e18,{from:jurorA})
        await klerosPOC.buyPinakion({from:jurorB,value:0.6e18})
        await klerosPOC.activateTokens(0.6e18,{from:jurorB})
        let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from:payer,value:0.1e18})
        let arbitrationFee = await klerosPOC.arbitrationCost(0x0,{from:payer})
        await arbitrableTransaction.payArbitrationFeeByPartyA({from:payer,value:arbitrationFee})
        await arbitrableTransaction.payArbitrationFeeByPartyB({from:payee,value:arbitrationFee})
        
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to vote.
        await klerosPOC.passPeriod({from:other})
        
        let drawA=[]
        let drawB=[]
        for (let i = 1; i <= 3; i++) {
            if(await klerosPOC.isDrawn(0, jurorA, i))
                drawA.push(i)
            else   
                drawB.push(i)
        }
        
        await klerosPOC.voteRuling(0, 1, drawA,{from:jurorA})
        await klerosPOC.voteRuling(0, 1, drawB,{from:jurorB})
        
        await klerosPOC.passPeriod({from:other}) // Pass twice to go to execution.
        await klerosPOC.passPeriod({from:other})
        await expectThrow(klerosPOC.executeRuling(0,{from:other})) // Should not be executable before.
        await klerosPOC.oneShotTokenRepartition(0,{from:other})
        let payerBalanceBeforeExecution = web3.eth.getBalance(payer)
        await klerosPOC.executeRuling(0,{from:other})
        let payerBalanceAfterExecution = web3.eth.getBalance(payer)
        await expectThrow(klerosPOC.executeRuling(0,{from:other})) // Should not be executable multiple times.
        assert.equal(payerBalanceBeforeExecution.toNumber()+0.1e18+arbitrationFee.toNumber(),payerBalanceAfterExecution.toNumber(), "The payer has not been refunded.")
        
    })
    
    
})


