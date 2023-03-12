const axios = require('axios');
const Coin = require('../models/coin');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// LiveCoinWatch ------------------ get coin img, name, price, 1 hour 24 hours, 7 days, market cap and volume from LivecoinWatch

const getLiveCoinWatchData = () => {
  let intervalId;

  const config = {
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.LIVECOINWATCH_API_KEY,
    },
  };


  const fetchCoinData = async (offset) => {
    
    const data = {
      currency: "USD",
      sort: "rank",
      order: "ascending",
      offset: offset,
      limit: 100,
      meta: true,
    };
    
    try {
      let response = await axios.post(
        "https://api.livecoinwatch.com/coins/list",
        data,
        config
      );
      var coinData = [];

      for (const item of response.data) {
        // Check if the coin already exists in the database
        const existingCoin = await Coin.findOne({ name: item.name });

        if (existingCoin) {
          // Update the existing coin's information with the fetched data
          existingCoin.imgURL = item.png32;
          existingCoin.price = item.rate;
          existingCoin.hourlyChanged = item.delta.hour;
          existingCoin.dailyChanged = item.delta.day;
          existingCoin.weeklyChanged = item.delta.week;
          existingCoin.marketCap = item.cap;
          existingCoin.volume = item.volume;

          await existingCoin.save();
          coinData.push(existingCoin)
          console.log(`LiveCoinWatch ------ ${existingCoin.name} is Existing and Updated.`)
        } else {
          // Create a new coin documnet with the with the fetched data
          const newCoin = new Coin({
            rank: item.rank,
            name: item.name,
            symbol: item.code,
            imgURL: item.png32,
            price: item.rate,
            hourlyChanged: item.delta.hour,
            dailyChanged: item.delta.day,
            weeklyChanged: item.delta.week,
            marketCap: item.cap,
            volume: item.volume,
          })

          await newCoin.save();
          console.log(`LiveCoinWatch ------ ${newCoin.name} is new and Updated.`)
        }
      }


    } catch (error) {
      console.log(error);
      clearInterval(intervalId);
    }
  };

  // Fetch data for each offset range
  const offsets = Array.from({ length: 20 }, (_, i) => i * 100);
  const fetchAllData = async () => {
    await Promise.all(offsets.map(offset => fetchCoinData(offset)));

    // for (const offset of offsets) {
    //   await fetchCoinData(offset);
    // }

    console.log("---------- Getting LiveCoinWatch Information is successfully finished! ----------")
  };

  fetchAllData();

  // Call fetchAllData every 5 minutes
  intervalId = setInterval(fetchAllData, 300000);
};


// IntotheBlock ------------------ update coin information from intotheblock API.


const callIntotheBlockAPI = async (symbols, dateRange) => {
  
  // set the header
  const config = {
    headers: {
      "X-Api-Key": process.env.INTOTHEBLOCK_API_KEY,
    }
  }

  // iterate every symbols
  for (const eachsymbol of symbols) {

      const url = `https://api.intotheblock.com/${eachsymbol.toLowerCase()}/financial?since=${dateRange.since}&until=${dateRange.until}`;

      const response = await axios.get(url, config);
      // Get the coin info from the response
      const { name, price, rank } = response.data;
      const inOutOfTheMoneyHistory = response.data.inOutOfTheMoneyHistory || [];
      const breakEvenPriceHistory = response.data.breakEvenPriceHistory || [];
      const volatility = response.data.volatility || [];
      const largeTxs = response.data.largeTxs || [];

      const existingCoin = await Coin.findOne({ name })
      
      const coin = {
        name,
        priceList: price,
        rank,
        inOutOfTheMoneyHistory,
        breakEvenPriceHistory,
        volatility,
        largeTxs
      }

      // Check there is same Coin in the database or not
      if (existingCoin) {
        await Coin.findOneAndUpdate({ name }, coin);
        console.log(`IntotheBlock ------ ${name} is existing and updated`)
      } else {
        await new Coin(coin).save();
        console.log(`IntotheBlock ------ ${coin.name} is new and updated`)
      }
      // Delay for one second before calling the next API
      await new Promise(resolve => setTimeout(resolve, 3000));
  }
}


const updateIntotheBlockCoins = async () => {

  const dateRange = {
    since: '2023-03-07',
    until: '2023-03-08',
  }

  const coinData = fs.readFileSync(path.join(__dirname, '../data/intotheblock.json'));
  const coins = JSON.parse(coinData);
  
  const symbols = coins.map(coin => {
    let symbol = coin.symbol;

    // Modify symbol if needed
    // if (symbol === "USDT") {
    //   symbol = "USD";
    // }

    return symbol;
  })

  await callIntotheBlockAPI(symbols, dateRange);
  console.log('---------- Getting IntotheBlock Information is successfully finished! ----------');
};

// Update IntotheBlockCoins every 4 times in a day. Time is 1, 7, 13, 19 o'clock in GMT timezone.
const getIntheBlockCoinData = () => {
  cron.schedule('0 1,7,13,19 * * *', () => {
    updateIntotheBlockCoins();
  }, {
    scheduled: true,
    timezone: 'Etc/GMT' // GMT timezone
  })
}

module.exports = {
  getLiveCoinWatchData,
  updateIntotheBlockCoins,
  getIntheBlockCoinData,
}