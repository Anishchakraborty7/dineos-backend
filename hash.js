const bcrypt = require('bcrypt');

bcrypt.hash('anishking12', 10).then(hash => {
  console.log(hash);
});