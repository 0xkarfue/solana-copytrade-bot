import { Keypair, LAMPORTS_PER_SOL, Connection, VersionedTransaction } from "@solana/web3.js";
import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient } from "./generated/prisma";
import { getBalanceMessage } from "../getBalance";
import { swap } from "../swap";
import { isValidToken } from "../utils/isValid";
import { getUserTokens } from "../utils/getUserToken";
import { isValidWallet } from "../utils/isValidWallet";

const prisma = new PrismaClient();
const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new Bot(token);
const connection = new Connection(process.env.RPC_URL!);

// hold state of user

const userState: Record<string, {
  tokenMint?: string;
  action?: "buy" | "sell" | "copy";
  tokenAmount?: number;
  tokenDecimals?: number;
  targetWallet?: string;
}> = {};

const inlineKeyboard = new InlineKeyboard()
  .text("🔑 Public Key", "public")
  .text("🔄 Refresh", "refresh")
  .text("🕵️ Private Key", "private")
  .row()
  .text("🤝 Copy Trade", "copyTrade")
  .text("💱 Trade", "trade")
  .row();

const buyOptions = new InlineKeyboard()
  .text("0.01 SOL", "buy_0.01")
  .text("0.05 SOL", "buy_0.05")
  .row();

const tradeOptions = new InlineKeyboard()
  .text("Buy", "buy")
  .text("Sell", "sell");

const sellOptions = new InlineKeyboard()
  .text("10%", "sell_10")
  .text("25%", "sell_25")
  .text("50%", "sell_50")
  .row()
  .text("100%", "sell_100");

const copyOptions = new InlineKeyboard()
  .text("Copy 10%", "copy_10")
  .text("Copy 25%", "copy_25")
  .row()
  .text("Copy 50%", "copy_50")
  .text("Copy 100%", "copy_100")
  .row()
  .text("❌ Stop Copying", "stop_copy");

bot.command("start", async (ctx) => {
  const existing = await prisma.user.findFirst({
    where: { tgUserId: ctx.chatId.toString() }
  });

  if (existing) {
    const balance = await getBalanceMessage(existing.publicKey);
    return ctx.reply(
      `⚠️ *Wallet Already Exists!*\n\n📬 *Address:* \`${existing.publicKey}\`\n💰 *Balance:* ${balance.message}`,
      {
        parse_mode: "Markdown",
        reply_markup: inlineKeyboard
      }
    );
  }

  const keypair = Keypair.generate();

  await prisma.user.create({
    data: {
      tgUserId: ctx.chatId.toString(),
      privateKey: Buffer.from(keypair.secretKey).toString("base64"),
      publicKey: keypair.publicKey.toBase58()
    }
  });

  const balance = await getBalanceMessage(keypair.publicKey.toBase58());

  return ctx.reply(
    `👋 *Welcome to Echo!*\n\n📬 *Your Address:* \`${keypair.publicKey.toBase58()}\`\n💰 *Balance:* ${balance.message}`,
    {
      parse_mode: "Markdown",
      reply_markup: inlineKeyboard
    }
  );
});

bot.callbackQuery("public", async (ctx) => {
  const user = await prisma.user.findFirst({
    where: { tgUserId: ctx.chatId?.toString() },
    select: { publicKey: true }
  });
  await ctx.answerCallbackQuery();
  await ctx.reply(`🔓 *Public Key:*\n\`${user?.publicKey}\``, { parse_mode: "Markdown" });
});

bot.callbackQuery("private", async (ctx) => {
  const user = await prisma.user.findFirst({
    where: { tgUserId: ctx.chatId?.toString() },
    select: { privateKey: true }
  });
  await ctx.answerCallbackQuery();
  await ctx.reply(`🔐 *Private Key:*\n\`${user?.privateKey}\``, { parse_mode: "Markdown" });
});

bot.callbackQuery("refresh", async (ctx) => {
  const user = await prisma.user.findFirst({
    where: { tgUserId: ctx.chatId?.toString() }
  });

  if (!user) {
    await ctx.answerCallbackQuery();
    return ctx.reply("❌ *User not found.*\nUse /start to create your wallet again.", { parse_mode: "Markdown" });
  }

  const balance = await getBalanceMessage(user.publicKey);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `📬 *Address:* \`${user.publicKey}\`\n💰 *Balance:* ${balance.message}`,
    { parse_mode: "Markdown", reply_markup: inlineKeyboard }
  );
});

bot.callbackQuery("trade", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Trade", { reply_markup: tradeOptions });
});

// BUY FLOW
bot.callbackQuery("buy", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.chatId) return;
  userState[ctx.chatId.toString()] = { action: "buy" };
  await ctx.reply("💡 *Please enter the Token Address:*", { parse_mode: "Markdown" });
});

// SELL FLOW
bot.callbackQuery("sell", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.chatId) return;
  userState[ctx.chatId.toString()] = { action: "sell" };
  await ctx.reply("💡 *Please enter the Token Address:*", { parse_mode: "Markdown" });
});


bot.on("message:text", async (ctx) => {
  const chatId = ctx.chatId.toString();
  const inputText = ctx.message.text; 

  const state = userState[chatId];

  if (!state || !state.action) {
    return; 
  }

 
  if (state.action === "copy") {
    const validation = await isValidWallet(inputText);

    if (!validation.valid) {
      return ctx.reply(`❌ *${validation.error}*`, { parse_mode: "Markdown" });
    }

    
    if (!userState[chatId]) {
      userState[chatId] = {};
    }
    userState[chatId].targetWallet = inputText;

    return ctx.reply(
      `✅ *Valid wallet detected!*\n\n📍 Address: \`${inputText}\`\n\nSelect copy percentage:`,
      {
        parse_mode: "Markdown",
        reply_markup: copyOptions
      }
    );
  }

  
  const isValid = await isValidToken(inputText);

  if (!isValid) {
    return ctx.reply("⚠️ *Invalid Token Address!*", { parse_mode: "Markdown" });
  }

  
  if (!userState[chatId]) {
    userState[chatId] = {};
  }
  userState[chatId].tokenMint = inputText;

  if (state.action === "buy") {
    
    return ctx.reply("💰 *Enter the amount you want to trade:*", {
      parse_mode: "Markdown",
      reply_markup: buyOptions
    });
  } else if (state.action === "sell") {
    
    const user = await prisma.user.findFirst({
      where: { tgUserId: chatId },
      select: { publicKey: true }
    });

    if (!user) {
      delete userState[chatId];
      return ctx.reply("❌ *User not found.*", { parse_mode: "Markdown" });
    }

    const tokens = await getUserTokens(user.publicKey);
    const match = tokens.find((t) => t.mint === inputText);

    if (!match) {
      delete userState[chatId];
      return ctx.reply("❌ You don't hold this token in your wallet.");
    }

    // Store amount and decimals
    if (!userState[chatId]) {
      userState[chatId] = {};
    }
    userState[chatId].tokenAmount = match.amount;
    userState[chatId].tokenDecimals = match.decimals;

    return ctx.reply(
      `✅ You hold *${match.amount}* of token:\n\`${match.mint}\`\n\nSelect percentage to sell:`,
      {
        parse_mode: "Markdown",
        reply_markup: sellOptions
      }
    );
  }
});

// BUY callbacks
bot.callbackQuery(/^buy_(.+)$/, async (ctx) => {
  const match = ctx.match;
  if (!match || typeof match === 'string') return;

  const amount = parseFloat(match[1]!);
  await handleBuy(ctx, amount);
});

// SELL callbacks
bot.callbackQuery(/^sell_(.+)$/, async (ctx) => {
  const match = ctx.match;
  if (!match || typeof match === 'string') return;

  const percentage = parseInt(match[1]!);
  await handleSell(ctx, percentage);
});


async function handleBuy(ctx: any, amountSol: number) {
  try {
    const chatId = ctx.chatId?.toString();
    if (!chatId) return;

    const user = await prisma.user.findFirst({
      where: { tgUserId: chatId }
    });

    if (!user) {
      await ctx.answerCallbackQuery();
      return ctx.reply("❌ *User not found.* Please use /start", { parse_mode: "Markdown" });
    }

    const tokenMint = userState[chatId]?.tokenMint;
    if (!tokenMint) {
      await ctx.answerCallbackQuery();
      return ctx.reply("⚠️ *No token selected.* Please start trade again.", { parse_mode: "Markdown" });
    }

    await ctx.answerCallbackQuery();
    await ctx.reply("🔄 *Processing buy...*", { parse_mode: "Markdown" });

    // BUY SOL → Token
    const swapTxn = await swap(
      "So11111111111111111111111111111111111111112", // Input: SOL
      tokenMint, // Output: Token
      amountSol * LAMPORTS_PER_SOL,
      user.publicKey
    );

    const secretKeyArray = Uint8Array.from(Buffer.from(user.privateKey, "base64"));
    const userKeypair = Keypair.fromSecretKey(secretKeyArray);

    const tx = VersionedTransaction.deserialize(
      Uint8Array.from(Buffer.from(swapTxn, "base64"))
    );

    tx.sign([userKeypair]);
    const signature = await connection.sendTransaction(tx);

    delete userState[chatId];

    await ctx.reply(
      `✅ *Buy Successful!*\n\n💰 *Amount:* ${amountSol} SOL\n🔗 [View Transaction](https://solscan.io/tx/${signature})`,
      { parse_mode: "Markdown", reply_markup: inlineKeyboard }
    );
  } catch (error) {
    console.error("Buy error:", error);
    await ctx.reply("❌ *Error while buying.* Please try again.", { parse_mode: "Markdown" });
    if (ctx.chatId) delete userState[ctx.chatId.toString()];
  }
}

async function handleSell(ctx: any, percentage: number) {
  try {
    const chatId = ctx.chatId?.toString();
    if (!chatId) return;

    const user = await prisma.user.findFirst({
      where: { tgUserId: chatId }
    });

    if (!user) {
      await ctx.answerCallbackQuery();
      return ctx.reply("❌ *User not found.* Please use /start", { parse_mode: "Markdown" });
    }

    const state = userState[chatId];
    if (!state?.tokenMint || state.tokenAmount === undefined || state.tokenDecimals === undefined) {
      await ctx.answerCallbackQuery();
      return ctx.reply("⚠️ *No token selected.* Please start trade again.", { parse_mode: "Markdown" });
    }

    await ctx.answerCallbackQuery();
    await ctx.reply(`🔄 *Processing sell (${percentage}%)...*`, { parse_mode: "Markdown" });


    const amountToSell = state.tokenAmount * (percentage / 100);


    const amountInSmallestUnit = Math.floor(amountToSell * Math.pow(10, state.tokenDecimals));


    const swapTxn = await swap(
      state.tokenMint, // Input: Token
      "So11111111111111111111111111111111111111112", // Output: SOL
      amountInSmallestUnit,
      user.publicKey
    );

    const secretKeyArray = Uint8Array.from(Buffer.from(user.privateKey, "base64"));
    const userKeypair = Keypair.fromSecretKey(secretKeyArray);

    const tx = VersionedTransaction.deserialize(
      Uint8Array.from(Buffer.from(swapTxn, "base64"))
    );

    tx.sign([userKeypair]);
    const signature = await connection.sendTransaction(tx);

    delete userState[chatId];

    await ctx.reply(
      `✅ *Sell Successful!*\n\n💰 *Sold:* ${percentage}% (${amountToSell.toFixed(4)} tokens)\n🔗 [View Transaction](https://solscan.io/tx/${signature})`,
      { parse_mode: "Markdown", reply_markup: inlineKeyboard }
    );
  } catch (error) {
    console.error("Sell error:", error);
    await ctx.reply("❌ *Error while selling.* Please try again.", { parse_mode: "Markdown" });
    if (ctx.chatId) delete userState[ctx.chatId.toString()];
  }
}

bot.callbackQuery("copyTrade", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.chatId) return;


  userState[ctx.chatId.toString()] = { action: "copy" };

  await ctx.reply("💡 *Please enter the Solana wallet address you want to copy:*", {
    parse_mode: "Markdown"
  });
});



bot.callbackQuery(/^copy_(.+)$/, async (ctx) => {
  const match = ctx.match;
  if (!match || typeof match === 'string') return;
  
  const percentage = parseInt(match[1]!);
  await handleCopySetup(ctx, percentage);
});

bot.callbackQuery("stop_copy", async (ctx) => {
  const chatId = ctx.chatId?.toString();
  if (!chatId) return;

  await ctx.answerCallbackQuery();

  
  const user = await prisma.user.findFirst({
    where: { tgUserId: chatId }
  });

  if (user) {
    await prisma.targetWallet.deleteMany({
      where: { userId: user.id }
    });
    
    await prisma.copySettings.delete({
      where: { userId: user.id }
    }).catch(() => {}); 
  }

  delete userState[chatId];

  await ctx.reply("✅ *Copy trading stopped!*", { 
    parse_mode: "Markdown",
    reply_markup: inlineKeyboard 
  });
});

async function handleCopySetup(ctx: any, percentage: number) {
  try {
    const chatId = ctx.chatId?.toString();
    if (!chatId) return;

    await ctx.answerCallbackQuery();

    const state = userState[chatId];
    if (!state?.targetWallet) {
      return ctx.reply("⚠️ *No wallet selected.* Please start again.", { parse_mode: "Markdown" });
    }

    
    const user = await prisma.user.findFirst({
      where: { tgUserId: chatId }
    });

    if (!user) {
      return ctx.reply("❌ *User not found.* Please use /start", { parse_mode: "Markdown" });
    }

    
    const targetWallet = await prisma.targetWallet.create({
      data: {
        address: state.targetWallet,
        userId: user.id,
        isActive: true
      }
    });

    
    await prisma.copySettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        copyPercentage: percentage,
        isActive: true
      },
      update: {
        copyPercentage: percentage,
        isActive: true
      }
    });

    delete userState[chatId];

    await ctx.reply(
      `✅ *Copy Trading Activated!*\n\n` +
      `📍 Target: \`${state.targetWallet}\`\n` +
      `📊 Copy Percentage: ${percentage}%\n\n` +
      `🤖 Bot will now monitor and copy trades automatically!`,
      { 
        parse_mode: "Markdown",
        reply_markup: inlineKeyboard 
      }
    );

    // TODO: Start monitoring this wallet (we'll do this next)
    // monitorWallet(state.targetWallet, user.id, percentage);

  } catch (error) {
    console.error("Copy setup error:", error);
    await ctx.reply("❌ *Error setting up copy trade.* Please try again.", { parse_mode: "Markdown" });
    if (ctx.chatId) delete userState[ctx.chatId.toString()];
  }
}

bot.start();

