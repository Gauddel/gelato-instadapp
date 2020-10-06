const { expect } = require("chai");
const bre = require("@nomiclabs/buidler");
const { ethers } = bre;
const GelatoCoreLib = require("@gelatonetwork/core");

// #region Contracts ABI

const InstaIndex = require("../pre-compiles/InstaIndex.json");
const InstaList = require("../pre-compiles/InstaList.json");
const InstaAccount = require("../pre-compiles/InstaAccount.json");
const ConnectGelato = require("../pre-compiles/ConnectGelato.json");
const ConnectMaker = require("../pre-compiles/ConnectMaker.json");
const ConnectCompound = require("../pre-compiles/ConnectCompound.json");
const ConnectInstaPool = require("../pre-compiles/ConnectInstaPool.json");
const ConnectAuth = require("../pre-compiles/ConnectAuth.json");
const DssCdpManager = require("../pre-compiles/DssCdpManager.json");
const GetCdps = require("../pre-compiles/GetCdps.json");
const IERC20 = require("../pre-compiles/IERC20.json");
const CTokenInterface = require("../artifacts/CTokenInterface.json");

// #endregion

const MIN_SPREAD = ethers.utils.parseUnits("1", 24);

describe("", function () {
  this.timeout(0);
  if (bre.network.name !== "ganache") {
    console.error("Test Suite is meant to be run on ganache only");
    process.exit(1);
  }

  // Wallet to use for local testing
  let userWallet;
  let userAddress;

  // Deployed instances
  let connectGelato;
  let connectMaker;
  let connectAuth;
  let connectInstaPool;
  let connectCompound;
  let instaIndex;
  let instaList;
  let dssCdpManager;
  let getCdps;
  let daiToken;
  let gelatoCore;
  let cDaiToken;

  // Contracts to deploy and use for local testing
  let conditionCompareRate;
  let makerDAOStabilityFee;
  let compoundBorrowRate;

  // Creation during test
  let dsa;

  before(async function () {
    // Get Test Wallet for local testnet
    [userWallet] = await ethers.getSigners();
    userAddress = await userWallet.getAddress();

    // Ganache default accounts prefilled with 100 ETH
    expect(await userWallet.getBalance()).to.be.gt(
      ethers.utils.parseEther("10")
    );

    // ===== Get Deployed Contract Instance ==================
    instaIndex = await ethers.getContractAt(
      InstaIndex.abi,
      bre.network.config.InstaIndex
    );
    instaList = await ethers.getContractAt(
      InstaList.abi,
      bre.network.config.InstaList
    );
    connectGelato = await ethers.getContractAt(
      ConnectGelato.abi,
      bre.network.config.ConnectGelato
    );
    connectMaker = await ethers.getContractAt(
      ConnectMaker.abi,
      bre.network.config.ConnectMaker
    );
    connectAuth = await ethers.getContractAt(
      ConnectAuth.abi,
      bre.network.config.ConnectAuth
    );
    connectInstaPool = await ethers.getContractAt(
      ConnectInstaPool.abi,
      bre.network.config.ConnectInstaPool
    );
    connectCompound = await ethers.getContractAt(
      ConnectCompound.abi,
      bre.network.config.ConnectCompound
    );
    dssCdpManager = await ethers.getContractAt(
      DssCdpManager.abi,
      bre.network.config.DssCdpManager
    );
    getCdps = await ethers.getContractAt(
      GetCdps.abi,
      bre.network.config.GetCdps
    );
    daiToken = await ethers.getContractAt(IERC20.abi, bre.network.config.DAI);
    gelatoCore = await ethers.getContractAt(
      GelatoCoreLib.GelatoCore.abi,
      bre.network.config.GelatoCore
    );
    cDaiToken = await ethers.getContractAt(
      CTokenInterface.abi,
      bre.network.config.CDAI
    );
    // instaEvent = await ethers.getContractAt(
    //     InstaEvent.abi,
    //     bre.network.config.InstaEvent
    // )

    // ===== Deploy Needed Contract ==================

    const ConditionCompareRate = await ethers.getContractFactory(
      "ConditionCompareUintsFromTwoSources"
    );
    conditionCompareRate = await ConditionCompareRate.deploy();
    await conditionCompareRate.deployed();

    const MakerDAOStabilityFee = await ethers.getContractFactory(
      "MakerDAOStabilityFee"
    );
    makerDAOStabilityFee = await MakerDAOStabilityFee.deploy();
    await makerDAOStabilityFee.deployed();

    const CompoundBorrowRate = await ethers.getContractFactory(
      "CompoundBorrowRate"
    );
    compoundBorrowRate = await CompoundBorrowRate.deploy();
    await compoundBorrowRate.deployed();
  });

  it("Use debt bridge if compound borrow rate is bigger than maker stability fees plus a minimum spread predetermined", async function () {
    // #1 Create a DeFi Smart Account for user.
    // #2 Open a Vault / Deposit ether / Borrow Dai on Maker.
    // #3 Give Authorization to Gelato Core Contract.
    // #4 Call multiprovide of gelato to setup gelato's provider stack, assign executor and give provider module.
    // #5 Submit Debt refinance Task if maker stability rate is higher than the borrow rate of compound.
    // #6 Mock if needed.
    // #7 Exec the submitted Task.

    //#region 1 Create a DeFi Smart Account for user

    const dsaIDPrevious = await instaList.accounts();
    await expect(instaIndex.build(userAddress, 1, userAddress)).to.emit(
      instaIndex,
      "LogAccountCreated"
    );
    const dsaID = dsaIDPrevious.add(1);
    await expect(await instaList.accounts()).to.be.equal(dsaID);

    // Instantiate the DSA
    let dsaAddress = await instaList.accountAddr(dsaID);
    dsa = await ethers.getContractAt(InstaAccount.abi, dsaAddress);

    //#endregion

    //#region 2 Open a Vault / Deposit ether / Borrow Dai on Maker

    let colName = "ETH-A";

    const openVault = await bre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "open",
      inputs: [colName],
    });

    await dsa.cast([bre.network.config.ConnectMaker], [openVault], userAddress);

    let cdps = await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address);
    let ilk = cdps.ilks[0];
    let cdpId = String(cdps.ids[0]);

    expect(cdps.ids[0].isZero()).to.be.false;

    const depositOnVault = await bre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "deposit",
      inputs: [cdpId, ethers.utils.parseEther("10"), 0, 0],
    });

    await dsa.cast(
      [bre.network.config.ConnectMaker],
      [depositOnVault],
      userAddress,
      {
        value: ethers.utils.parseEther("10"),
      }
    );

    const borrowDai = await bre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "borrow",
      inputs: [cdpId, ethers.utils.parseUnits("100", 18), 0, 0],
    });

    await dsa.cast([bre.network.config.ConnectMaker], [borrowDai], userAddress);

    let dsaDAIBalance = await daiToken.balanceOf(dsa.address);
    expect(dsaDAIBalance).to.be.equal(ethers.utils.parseEther("100"));

    //#endregion

    //#region 3 Give Authorization to Gelato Core Contract.

    let addAuthData = await bre.run("abi-encode-withselector", {
      abi: ConnectAuth.abi,
      functionname: "add",
      inputs: [gelatoCore.address],
    });

    await dsa.cast(
      [bre.network.config.ConnectAuth],
      [addAuthData],
      userAddress
    );

    expect(await dsa.isAuth(gelatoCore.address)).to.be.true;

    //#endregion

    //#region 4 Call multiprovide of gelato to setup gelato's provider stack, assign executor and give provider module.

    await gelatoCore.stakeExecutor({
      value: await gelatoCore.minExecutorStake(),
    });
    expect(await gelatoCore.isExecutorMinStaked(userAddress)).to.be.true;

    const GAS_LIMIT = "4000000";
    const GAS_PRICE_CEIL = ethers.utils.parseUnits("1000", "gwei");
    const TASK_AUTOMATION_FUNDS = await gelatoCore.minExecProviderFunds(
      GAS_LIMIT,
      GAS_PRICE_CEIL
    );

    await dsa.cast(
      [connectGelato.address], // targets
      [
        await bre.run("abi-encode-withselector", {
          abi: ConnectGelato.abi,
          functionname: "multiProvide",
          inputs: [
            userAddress,
            [],
            [bre.network.config.ProviderModuleDSA],
            TASK_AUTOMATION_FUNDS,
            0,
            0,
          ],
        }),
      ], // datas
      userAddress, // origin
      {
        value: TASK_AUTOMATION_FUNDS,
        gasLimit: 5000000,
      }
    );

    expect(await gelatoCore.providerFunds(dsa.address)).to.be.gte(
      TASK_AUTOMATION_FUNDS
    );
    expect(
      await gelatoCore.isProviderLiquid(dsa.address, GAS_LIMIT, GAS_PRICE_CEIL)
    );
    expect(await gelatoCore.executorByProvider(dsa.address)).to.be.equal(
      userAddress
    );
    expect(
      await gelatoCore.isModuleProvided(
        dsa.address,
        bre.network.config.ProviderModuleDSA
      )
    ).to.be.true;

    //#endregion

    //#region 5 Submit Debt refinance Task if maker stability rate is higher than the borrow rate of compound.

    let borrowAmount = ethers.utils.parseUnits("100", 18);
    var ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

    const debtBridgeCondition = new GelatoCoreLib.Condition({
      inst: conditionCompareRate.address,
      data: await conditionCompareRate.getConditionData(
        makerDAOStabilityFee.address,
        compoundBorrowRate.address,
        await bre.run("abi-encode-withselector", {
          abi: require("../artifacts/MakerDAOStabilityFee.json").abi,
          functionname: "getAnnualFee",
          inputs: [ethers.utils.formatBytes32String(colName)],
        }),
        await bre.run("abi-encode-withselector", {
          abi: require("../artifacts/CompoundBorrowRate.json").abi,
          functionname: "getCDAIAPRInRay",
        }),
        MIN_SPREAD
      ),
    });

    // ======= Action/Spells setup ======
    const spells = [];

    // let cdaiApr = await compoundBorrowRate.getCDAIAPRInRay();
    // console.log('Compound', String(cdaiApr));

    // console.log(ethers.utils.formatBytes32String(colName));
    // let stabFees = await makerDAOStabilityFee.getAnnualFee(ethers.utils.formatBytes32String(colName));
    // console.log('Stability Fees', String(stabFees))

    let flashBorrow = new GelatoCoreLib.Action({
      addr: connectInstaPool.address,
      data: await bre.run("abi-encode-withselector", {
        abi: ConnectInstaPool.abi,
        functionname: "flashBorrow",
        inputs: [bre.network.config.DAI, borrowAmount, 0, 0],
      }),
      operation: GelatoCoreLib.Operation.Delegatecall,
    });

    spells.push(flashBorrow);

    let paybackMaker = new GelatoCoreLib.Action({
      addr: connectMaker.address,
      data: await bre.run("abi-encode-withselector", {
        abi: ConnectMaker.abi,
        functionname: "payback",
        inputs: [cdpId, ethers.constants.MaxUint256, 0, "534"],
      }),
      operation: GelatoCoreLib.Operation.Delegatecall,
    });

    spells.push(paybackMaker);

    let withdrawMaker = new GelatoCoreLib.Action({
      addr: connectMaker.address,
      data: await bre.run("abi-encode-withselector", {
        abi: ConnectMaker.abi,
        functionname: "withdraw",
        inputs: [cdpId, ethers.constants.MaxUint256, 0, "987"],
      }),
      operation: GelatoCoreLib.Operation.Delegatecall,
    });

    spells.push(withdrawMaker);

    let depositCompound = new GelatoCoreLib.Action({
      addr: connectCompound.address,
      data: await bre.run("abi-encode-withselector", {
        abi: ConnectCompound.abi,
        functionname: "deposit",
        inputs: [ETH, 0, "987", 0],
      }),
      operation: GelatoCoreLib.Operation.Delegatecall,
    });

    spells.push(depositCompound);

    let borrowCompound = new GelatoCoreLib.Action({
      addr: connectCompound.address,
      data: await bre.run("abi-encode-withselector", {
        abi: ConnectCompound.abi,
        functionname: "borrow",
        inputs: [bre.network.config.DAI, 0, "534", 0],
      }),
      operation: GelatoCoreLib.Operation.Delegatecall,
    });

    spells.push(borrowCompound);

    let flashPayBack = new GelatoCoreLib.Action({
      addr: connectInstaPool.address,
      data: await bre.run("abi-encode-withselector", {
        abi: ConnectInstaPool.abi,
        functionname: "flashPayback",
        inputs: [bre.network.config.DAI, 0, 0],
      }),
      operation: GelatoCoreLib.Operation.Delegatecall,
    });

    spells.push(flashPayBack);

    const refinanceIfCompoundBorrowIsBetter = new GelatoCoreLib.Task({
      conditions: [debtBridgeCondition],
      actions: spells,
      selfProviderGasLimit: GAS_LIMIT,
      selfProviderGasPriceCeil: GAS_PRICE_CEIL,
    });

    const gelatoSelfProvider = new GelatoCoreLib.GelatoProvider({
      addr: dsa.address,
      module: bre.network.config.ProviderModuleDSA,
    });

    const expiryDate = 0;
    await expect(
      dsa.cast(
        [connectGelato.address], // targets
        [
          await bre.run("abi-encode-withselector", {
            abi: ConnectGelato.abi,
            functionname: "submitTask",
            inputs: [
              gelatoSelfProvider,
              refinanceIfCompoundBorrowIsBetter,
              expiryDate,
            ],
          }),
        ], // datas
        userAddress, // origin
        {
          gasLimit: 5000000,
        }
      )
    ).to.emit(gelatoCore, "LogTaskSubmitted");

    const taskReceiptId = await gelatoCore.currentTaskReceiptId();
    const taskReceipt = new GelatoCoreLib.TaskReceipt({
      id: taskReceiptId,
      userProxy: dsa.address,
      provider: gelatoSelfProvider,
      tasks: [refinanceIfCompoundBorrowIsBetter],
      expiryDate,
    });

    //#endregion

    //#region 6 Mock if needed.

    const gelatoGasPrice = await bre.run("fetchGelatoGasPrice");
    expect(gelatoGasPrice).to.be.lte(
      refinanceIfCompoundBorrowIsBetter.selfProviderGasPriceCeil
    );

    expect(
      await gelatoCore.canExec(
        taskReceipt,
        refinanceIfCompoundBorrowIsBetter.selfProviderGasLimit,
        gelatoGasPrice
      )
    ).to.be.equal("ConditionNotOk:ANotGreaterOrEqualToBbyMinspread");

    let cdaiApr = await compoundBorrowRate.getCDAIAPRInRay();
    let stabFees = await makerDAOStabilityFee.getAnnualFee(
      ethers.utils.formatBytes32String(colName)
    );

    await makerDAOStabilityFee.mock(
      true,
      cdaiApr.sub(stabFees).add(MIN_SPREAD)
    );

    expect(
      await gelatoCore.canExec(
        taskReceipt,
        refinanceIfCompoundBorrowIsBetter.selfProviderGasLimit,
        gelatoGasPrice
      )
    ).to.be.equal("OK");

    //#endregion

    //#region 7 Exec the submitted Task.

    await expect(
      gelatoCore.exec(taskReceipt, {
        gasPrice: gelatoGasPrice, // Exectutor must use gelatoGasPrice (Chainlink fast gwei)
        gasLimit: refinanceIfCompoundBorrowIsBetter.selfProviderGasLimit,
      })
    ).to.emit(gelatoCore, "LogExecSuccess");

    expect((await cDaiToken.getAccountSnapshot(dsa.address))[2]).to.be.equal(
      ethers.utils.parseUnits("100", 18)
    ); // Check the borrow amount
    expect(await daiToken.balanceOf(dsa.address)).to.be.equal(
      ethers.utils.parseUnits("100", 18)
    );

    //#endregion
  });
});
