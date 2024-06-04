import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import BigNumber from 'bignumber.js';
import fs from 'fs';
import readlineSync from 'readline-sync';
import chalk from 'chalk';
import delay from 'delay';
import clear from 'clear';
import fetch from 'node-fetch';
import { table } from 'table';

// Define the sendTokens function
const sendTokens = async (fromKeypair, toAddress, coinType, amount) => {
    const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io" });
    const tx = new TransactionBlock();
    const gasBudget = '10000000';

    const coins = await client.getCoins({
        owner: fromKeypair.getPublicKey().toSuiAddress(),
        coinType: coinType
    });

    const primaryCoin = tx.object(coins.data[0].coinObjectId);
    const mergeCoins = coins.data.slice(1).map(coin => tx.object(coin.coinObjectId));

    if (mergeCoins.length > 0) {
        tx.mergeCoins(primaryCoin, mergeCoins);
    }

    const [coinToSend] = tx.splitCoins(primaryCoin, [amount]);

    tx.transferObjects([coinToSend], toAddress);
    tx.setGasBudget(gasBudget);

    const result = await client.signAndExecuteTransactionBlock({
        signer: fromKeypair,
        transactionBlock: tx,
    });

    return result;
};

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

const calculateFinishingInfo = (rewardInfo, userInfo) => {
  if (!rewardInfo) {
    return { timeToClaim: 0, unClaimedAmount: 0, progress: 0 };
  }
  if (!userInfo) {
    return {
      timeToClaim: 0,
      unClaimedAmount: Number(rewardInfo.initReward) / Math.pow(10, 9),
      progress: 100
    };
  }

  const boatLevel = rewardInfo.boatLevel[userInfo.boat];
  const meshLevel = rewardInfo.meshLevel[userInfo.mesh];
  const fishTypeLevel = rewardInfo.fishTypeLevel[userInfo.seafood];
  const currentTime = new Date().getTime();

  let timeRemaining = new BigNumber(0);
  let fishingTime = boatLevel.fishing_time * 3600000 / 10000;

  if (new BigNumber(userInfo.last_claim).plus(fishingTime).gt(currentTime)) {
    timeRemaining = new BigNumber(userInfo.last_claim).plus(fishingTime).minus(currentTime);
  }

  let unClaimedAmount = new BigNumber(fishingTime).minus(timeRemaining)
    .div(fishingTime)
    .times(boatLevel.fishing_time)
    .div(10000)
    .times(meshLevel.speed)
    .div(10000)
    .times(fishTypeLevel.rate)
    .div(10000);

  if (userInfo.special_boost) {
    const specialBoost = rewardInfo.specialBoost[userInfo.special_boost];
    if (specialBoost.type === 0 && currentTime >= specialBoost.start_time && currentTime <= specialBoost.start_time + specialBoost.duration) {
      unClaimedAmount = unClaimedAmount.times(specialBoost.rate).div(10000);
    }
    if (specialBoost.type === 1 && currentTime >= userInfo.special_boost_start_time && currentTime <= userInfo.special_boost_start_time + specialBoost.duration) {
      unClaimedAmount = unClaimedAmount.times(specialBoost.rate).div(10000);
    }
  }

  return {
    timeToClaim: timeRemaining.toNumber(),
    unClaimedAmount: unClaimedAmount.toFixed(5),
    progress: new BigNumber(fishingTime).minus(timeRemaining).times(100).div(fishingTime)
  };
};

const makeClaimTx = (client, signer, sender) => new Promise(async (resolve, reject) => {
  try {
    const txBlock = new TransactionBlock();
    txBlock.moveCall({
      target: "0x1efaf509c9b7e986ee724596f526a22b474b15c376136772c00b8452f204d2d1::game::claim",
      arguments: [txBlock.object("0x4846a1f1030deffd9dea59016402d832588cf7e0c27b9e4c1a63d2b5e152873a"), txBlock.object("0x6")]
    });
    txBlock.setGasBudget("10000000");
    txBlock.setSender(sender);
    const { bytes, signature } = await txBlock.sign({ client, signer });
    resolve({ bytes, signature });
  } catch (error) {
    reject(error);
  }
});

const sendTransaction = (client, txBytes, signature) => new Promise(async (resolve, reject) => {
  try {
    await client.dryRunTransactionBlock({ transactionBlock: txBytes });
    const result = await client.executeTransactionBlock({
      signature,
      transactionBlock: txBytes,
      requestType: "WaitForLocalExecution",
      options: { showEffects: true }
    });
    resolve(result);
  } catch (error) {
    reject(error);
  }
});

(async () => {
  if (!fs.existsSync("loginWave.json")) {
    fs.appendFileSync("loginWave.json", '[]');
  }

  console.log();
  console.log(chalk.yellow("    Membership x ETL Discussion\n"));
  console.log("    List Account Login");
  console.log();

  const loginData = fs.readFileSync("loginWave.json");
  const loginAccounts = JSON.parse(loginData);
  const accountCount = loginAccounts.length;
  let accountTable = [['id', "Address"]];
  const tableOptions = {
    columns: Array(5).fill({ alignment: "center" })
  };

  loginAccounts.forEach((account, index) => {
    accountTable.push([index, chalk.green(account.address)]);
  });
  console.log(table(accountTable, tableOptions));
  console.log(chalk.white('[') + chalk.green('!') + chalk.white(']') + " Waveonsui\n");
  console.log(chalk.white('[') + chalk.green('1') + chalk.white(']') + " Input Cookie / Delete Cookie");
  console.log(chalk.white('[') + chalk.green('2') + chalk.white(']') + " Automate Claim Ocean If Ready");
  console.log();

  const choice = readlineSync.question("Vote?? ");
  console.log();
  const gameInfo = fs.readFileSync("./gameInfo.json", "utf-8");

  if (choice == 1) {
    const action = readlineSync.question("[!] Delete / Add ? : ").toLowerCase();
    if (action === "add") {
      const phrase = readlineSync.question("[!] Phrase : ");
      console.log();
      const keypair = Ed25519Keypair.deriveKeypair(phrase);
      const publicKey = keypair.getPublicKey().toSuiAddress();
      if (publicKey) {
        loginAccounts.push({ address: publicKey, phrase });
        fs.writeFileSync("loginWave.json", JSON.stringify(loginAccounts));
        console.log(chalk.green("    Successfully input wallet"));
      } else {
        console.log(chalk.green("    Failure input wallet"));
      }
    } else if (action === "delete") {
      const updatedAccounts = loginAccounts.filter(Boolean);
      fs.writeFileSync("loginWave.json", JSON.stringify(updatedAccounts));
      console.log(chalk.white('[') + chalk.green('!') + chalk.white(']') + " Information  => " + chalk.yellow("Successfully Delete Account"));
    }
  } else if (choice == 2) {
    while (true) {
      for (let i = 0; i < loginAccounts.length; i++) {
        const { phrase } = loginAccounts[i];
        if (!phrase) continue;  // Ensure that phrase is not undefined

        try {
          clear();
          console.log(chalk.white('[') + chalk.green('!') + chalk.white(']') + " Automate Claim Ocean If Ready");
          console.log();
          const keypair = Ed25519Keypair.deriveKeypair(phrase);
          const address = keypair.getPublicKey().toSuiAddress();
          const suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });
          const balanceInfo = await suiClient.getBalance({ owner: address, coinType: "0xa8816d3a6e3136e86bc2873b1f94a15cadc8af2703c075f2d546c2ae367f4df9::ocean::OCEAN" });
          let oceanBalance = Number(balanceInfo.totalBalance) / Math.pow(10, 9);

          const fieldObject = await suiClient.getDynamicFieldObject({
            parentId: "0x4846a1f1030deffd9dea59016402d832588cf7e0c27b9e4c1a63d2b5e152873a",
            name: { type: "address", value: address }
          });
          const userData = fieldObject.data.content.fields;
          const finishingInfo = calculateFinishingInfo(JSON.parse(gameInfo), userData);

          let upgradeType = '';
          let levelType = '';
          let currentLevel = 0;

          if (userData.mesh === userData.boat) {
            upgradeType = "upgrade_mesh";
            levelType = "meshLevel";
            currentLevel = userData.mesh;
          } else if (userData.mesh > userData.boat) {
            upgradeType = "upgrade_boat";
            levelType = "boatLevel";
            currentLevel = userData.boat;
          } else if (userData.boat > userData.mesh) {
            upgradeType = "upgrade_mesh";
            levelType = "meshLevel";
            currentLevel = userData.mesh;
          }

          console.log(`
Account Number : ${chalk.yellow(i)};
Ocean Balance  : ${chalk.magenta(oceanBalance)} Ocean;
Sui Address    : ${chalk.magenta(address)};
Mesh Level     : ${chalk.green(userData.mesh)}; 
Unclaimed      : ${chalk.green(finishingInfo.unClaimedAmount)};
Progress Claim : ${chalk.green(parseFloat(finishingInfo.progress))}%;

          `);

          if (parseFloat(finishingInfo.progress) >= 100) {
            try {
              const { bytes, signature } = await makeClaimTx(suiClient, keypair, address);
              const result = await sendTransaction(suiClient, bytes, signature);
              if (result.effects.status.status === "success") {
                const updatedBalance = await suiClient.getBalance({
                  owner: address,
                  coinType: "0xa8816d3a6e3136e86bc2873b1f94a15cadc8af2703c075f2d546c2ae367f4df9::ocean::OCEAN"
                });
                oceanBalance = Number(updatedBalance.totalBalance) / Math.pow(10, 9);
                console.log("\nStatus Claim   : " + chalk.green("Claim Success") + ";\n                            ");
              } else {
                console.log("\nStatus Claim   : " + chalk.green("Claim Failure") + ";\n                            ");
              }
            } catch (error) {
              console.error(error);
            }
          } else {
            console.log("\nStatus Claim   : " + chalk.red("It's not time to claim yet") + ";\n");
          }

          await delay(5000);

          // Send tokens to main wallet if balance is 10 Ocean or more
          const mainWalletAddress = "0xb46033278e3f482e620d08c18bb7809e93b557da3ced6c863dc417c7ad5d8634";
          if (oceanBalance = 20) {
            try {
              const sendResult = await sendTokens(keypair, mainWalletAddress, "0xa8816d3a6e3136e86bc2873b1f94a15cadc8af2703c075f2d546c2ae367f4df9::ocean::OCEAN", balanceInfo.totalBalance);
              console.log(chalk.green(`Successfully sent ${oceanBalance} Ocean from ${address} to main wallet. Transaction: ${sendResult.digest}`));
            } catch (error) {
              console.log(chalk.red(`Failed to send tokens from ${address}: ${error.message}`));
            }
          }

          await delay(5000);

        } catch (error) {
          console.log("Checking Timeout Waiting For Delay 10 seconds");
          await delay(10000);
        }
      }
    }
  }
})();
