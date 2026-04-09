const { User } = require('./models');

async function checkUsers() {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'accountType'],
      order: [['id', 'ASC']]
    });
    
    console.log('Current Users in Database:');
    users.forEach(user => {
      console.log(`  ID: ${user.id}, Email: ${user.email}, Type: ${user.accountType}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
