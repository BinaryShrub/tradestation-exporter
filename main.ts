import { config } from "https://deno.land/x/dotenv@v1.0.1/mod.ts";

const env = config();

const fromStartOf = new Date("2024-10-01"); // Start date for all accounts

const toEndOf = new Date(); // Today's date

const main = async () => {
  const transactions: Transaction[] = [];
  const accountIds = env.ACCOUNT_ID_LIST.includes(",")
    ? env.ACCOUNT_ID_LIST.split(",")
    : [env.ACCOUNT_ID_LIST];

  for (const accountId of accountIds) {
    console.log(`Loading transactions for account: ${accountId}`);

    transactions.push(
      ...await loadAllTransactions({
        jwt: env.JWT,
        accountId,
        fromStartOf,
        toEndOf,
      }),
    );
  }

  transactions.sort((a, b) => {
    const dateDiff = b.date.getTime() - a.date.getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.accountId.localeCompare(b.accountId);
  });

  const formatDate = (date: Date) =>
    date.toISOString().slice(0, 10).replace(/-/g, "");

  const filename = `transactions.${formatDate(fromStartOf)}.${
    formatDate(toEndOf)
  }.csv`;

  writeCsv(
    [
      "date",
      "accountId",
      "type", // trade or cash
      "description",
      "buy",
      "sell",
      "price",
      "exchangeClearingFee",
      "nfaFee",
      "commissionFee",
    ],
    transactions,
    filename,
  );
};

const writeCsv = (headers: string[], data: any[], filename: string) => {
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((header) => {
        const value = row[header];
        if (value instanceof Date) {
          // Format as YYYY-MM-DD (ISO date without time)
          return value.toISOString().slice(0, 10);
        }
        return value;
      }).join(",")
    ),
  ].join("\n");
  console.log("CSV size (bytes):", new TextEncoder().encode(csvContent).length);

  Deno.writeTextFileSync(filename, csvContent);
};

const loadAllTransactions = async (config: {
  jwt: String;
  accountId: String;
  fromStartOf: Date;
  toEndOf: Date;
}) => {
  const { fromStartOf, toEndOf, ...rest } = config;
  const transactions: Transaction[] = [];
  let current = new Date(fromStartOf);
  const end = new Date(toEndOf);


  while (current < end) {
    const chunkStart = new Date(current);
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setMonth(chunkEnd.getMonth() + 2);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    const chunkExecutions = await loadExecutions({
      ...rest,
      fromStartOf: new Date(chunkStart),
      toEndOf: new Date(chunkEnd),
    });
    transactions.push(...chunkExecutions);

    const chunkCash = await loadCash({
      ...rest,
      fromStartOf: new Date(chunkStart),
      toEndOf: new Date(chunkEnd),
    });
    transactions.push(...chunkCash);

    // 1 QPS
    await new Promise((res) => setTimeout(res, 500));

    current = new Date(chunkEnd);
  }

  return transactions;
};

const loadExecutions = async (
  config: {
    jwt: String;
    accountId: String;
    fromStartOf: Date;
    toEndOf: Date;
  },
) => {
  const response = await fetch(
    "https://api.tradestation.com/graphql/v1/live/graphql",
    {
      headers: {
        authorization: `Bearer ${config.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        operationName: "FetchHistoricalFuturesTransactions",
        variables: {
          dateTo: new Date(config.toEndOf.setUTCHours(23, 59, 59, 0))
            .toISOString(),
          dateFrom: new Date(config.fromStartOf.setUTCHours(0, 0, 0, 0))
            .toISOString(),
          accountId: config.accountId,
          transactionType: "Trade",
          orderBy: "TransactionDate",
          sortOrder: "Descending",
        },
        query:
          `query FetchHistoricalFuturesTransactions($accountId: String!, $dateFrom: Date!, $dateTo: Date!, $transactionType: HistoricalFuturesTransactionType!, $orderBy: HistoricalFuturesTransactionOrderBy!, $sortOrder: HistoricalFuturesTransactionSortOrder!) {
      getHistoricalFuturesTransactions(
        accountId: $accountId
        dateFrom: $dateFrom
        dateTo: $dateTo
        transactionType: $transactionType
        orderBy: $orderBy
        sortOrder: $sortOrder
      ) {
        Transactions {
          Details {
            Transactions {
              AccountId
              Contract
              TradeDate
              Buy
              Sell
              Price
              Currency
              ExchangeClearingFees
              NfaFee
              CommissionUSD
            }
          }
        }
      }
    }`,
      }),
      method: "POST",
    },
  );

  const json = await response.json();

  if (!json.data || !json.data.getHistoricalFuturesTransactions) {
    throw new Error(
      "Invalid response from API:\n" + JSON.stringify(json, null, 2),
    );
  }

  if (
    !json.data.getHistoricalFuturesTransactions.Transactions ||
    json.data.getHistoricalFuturesTransactions.Transactions.length === 0
  ) {
    return [];
  }

  const rawExecutions = json.data.getHistoricalFuturesTransactions.Transactions
    .flatMap((transaction: any) => transaction.Details.Transactions);
  return parseExecutions(rawExecutions);
};

type Transaction = {
  date: Date;
  accountId: string;
  description: string;
  type: "trade" | "cash";
  buy: number | undefined;
  sell: number | undefined;
  price: number | undefined;
  exchangeClearingFee: number | undefined;
  nfaFee: number | undefined;
  commissionFee: number | undefined;
};

const parseExecutions = (executions: any[]): Transaction[] =>
  executions.map((t) => ({
    accountId: t.AccountId,
    description: t.Contract.trim(),
    type: "trade",
    date: new Date(t.TradeDate),
    buy: t.Buy,
    sell: t.Sell,
    price: t.Price,
    exchangeClearingFee: t.ExchangeClearingFees,
    nfaFee: t.NfaFee,
    commissionFee: t.CommissionUSD,
  } as Transaction));

const loadCash = async (
  config: {
    jwt: String;
    accountId: String;
    fromStartOf: Date;
    toEndOf: Date;
  },
) => {
  const response = await fetch(
    "https://api.tradestation.com/graphql/v1/live/graphql",
    {
      headers: {
        authorization: `Bearer ${config.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        operationName: "FetchHistoricalFuturesTransactions",
        variables: {
          dateTo: new Date(config.toEndOf.setUTCHours(23, 59, 59, 0))
            .toISOString(),
          dateFrom: new Date(config.fromStartOf.setUTCHours(0, 0, 0, 0))
            .toISOString(),
          accountId: config.accountId,
          transactionType: "Cash",
          orderBy: "TransactionDate",
          sortOrder: "Descending",
        },
        query:
          `query FetchHistoricalFuturesTransactions($accountId: String!, $dateFrom: Date!, $dateTo: Date!, $transactionType: HistoricalFuturesTransactionType!, $orderBy: HistoricalFuturesTransactionOrderBy!, $sortOrder: HistoricalFuturesTransactionSortOrder!) {
        getHistoricalFuturesTransactions(
          accountId: $accountId
          dateFrom: $dateFrom
          dateTo: $dateTo
          transactionType: $transactionType
          orderBy: $orderBy
          sortOrder: $sortOrder
        ) {
          Transactions {
            TransactionDate
            Description
            DebitCredit
          }
        }
      }`,
      }),
      method: "POST",
    },
  );

  const json = await response.json();

  if (!json.data || !json.data.getHistoricalFuturesTransactions) {
    throw new Error(
      "Invalid response from API:\n" + JSON.stringify(json, null, 2),
    );
  }

  if (
    !json.data.getHistoricalFuturesTransactions.Transactions ||
    json.data.getHistoricalFuturesTransactions.Transactions.length === 0
  ) {
    return [];
  }

  const rawCash = json.data.getHistoricalFuturesTransactions.Transactions;

  return parseCash(config.accountId, rawCash);
};




const parseCash = (accountId: String, cash: any[]): Transaction[] =>
  cash.map((t) => ({
    accountId,
    description: t.Description.trim(),
    type: "cash",
    date: new Date(t.TransactionDate),
    price: t.DebitCredit,
  } as Transaction));

main();
