const express = require('express');
const path = require('path');
const app = express();

// Serve specific route or entire public folder statically
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// app.use(express.static(path.join(__dirname, 'public'))); // Recommended for CSS/JS

app.listen(3000, () => console.log('Express server running at http://localhost:3000'));
