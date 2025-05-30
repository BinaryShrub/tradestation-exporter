# TradeStation Exporter

Bulk export tradestation executions for multiple accounts across any timeframe:

## How to Run

####
1. Copy the sample env file `cp .env.sample .env` and update it accordingly:

    ```
    # .env
    JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
    ACCOUNT_ID_LIST=123ABC45,678DEF90
    ```

    > Use Chrome Dev Tools to get your Bearer Token
    ![Example of getting the token in Chrome Dev Tools](assets/token_example.png)

2. In `main.ts` pick your `fromStartOf` and `toEndOf` dates

    ```ts
    const fromStartOf = new Date("2024-01-01");

    const toEndOf = new Date(); // Today's date

4. Run `./run.sh` and the export will run and write an `executions.csv` file.


    > You might get an error saying a contract isn't supported. If so, update the map in `main.ts`. 
    > 
    > Tip: https://gemini.google.com gets the contract symbol right most of the time!
    >
    > Example mapping:
    >
    > ```ts
    > const symbolByContract: { [key: string]: string } = {
    >     "DEC 24 CME MCRO NSDQ": "MNQZ2024",
    >     "DEC 24 CME MICRO S&P": "MESZ4",
    >     "DEC 24 CMX 1000OZSILV": "SILZ4",
    >     "DEC 24 CMX EMICR GOLD": "MGZ4",
    >     "DEC 24 CMX GOLD": "GCZ4",
    >     "DEC 24 CMX MHG COPPER": "MHGZ4",
    >     "DEC 24 CMX SILVER": "SIZ4",
    >     "DEC 24 EMINI S&P 500": "ESZ4",
    >     "DEC 24 IMM EMINI NSDQ": "NQZ4",
    >     "DEC 24 NYM LT CRUDE": "CLZ4",
    >     "DEC 24 NYM MICR CRUDE": "MCLZ4",
    >     "NOV 24 NYM MICR CRUDE": "MCLX4",
    >     "OCT 24 CME ETHER FUT": "ERV4",
    >     "OCT 24 CME MBT FUTURE": "MBTV4",
    >     "OCT 24 CME MICRO ETH": "METV4",
    > };
    > ```