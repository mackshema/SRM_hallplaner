import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

async function updateFaculty() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await mongoose.connection.collection('users').find({ role: 'faculty' }).toArray();
  
  for (let u of users) {
    const cleanName = (u.name || '').toLowerCase().replace(/\s+/g, '');
    const possiblePasswords = [
      `${cleanName}@srm1234`,
      'srm@123456789',
      'faculty123',
      's.krish@srm1234',
      'r.fdngf@srm1234',
      'm.sivasanjaymuthu@srm1234',
      'f.jmy@srm1234',
      'kk.k@srm1234',
      'p.hjkds@srm1234'
    ];
    let foundPassword = null;
    for (let p of possiblePasswords) {
      if (await bcrypt.compare(p, u.password)) {
        foundPassword = p;
        break;
      }
    }
    if (foundPassword) {
      await mongoose.connection.collection('users').updateOne(
        { _id: u._id },
        { $set: { plainPassword: foundPassword } }
      );
      console.log(`Updated ${u.username} -> plainPassword: ${foundPassword}`);
    } else {
      console.log(`Could not find plain password match for ${u.username}`);
    }
  }
  process.exit(0);
}

updateFaculty().catch(console.error);
