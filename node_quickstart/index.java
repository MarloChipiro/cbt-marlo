const { MongoClient } = require('mongodb');
async function runGetStarted() {
  // Replace the uri string with your connection string
  const uri = 'mongodb+srv://chipiromarlo33_db_user:dc7DjMytaZi0z1Yz@cluster0.zyw14h3.mongodb.net/?appName=Cluster0';
  const client = new MongoClient(uri);
  try {
    const database = client.db('sample_mflix');
    const movies = database.collection('movies');
    // Queries for a movie that has a title value of 'Back to the Future'
    const query = { title: 'Back to the Future' };
    const movie = await movies.findOne(query);
    console.log(movie);
  } finally {
    await client.close();
  }
}
runGetStarted().catch(console.dir);