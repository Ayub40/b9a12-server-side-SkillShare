const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 1001;

// middleware
app.use(cors({
    origin:[
        "http://localhost:5173",
        "skillshare-74674.web.app",
        "skillshare-74674.firebaseapp.com"
    ]
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uxvdig6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const classCollection = client.db("skillShareDb").collection("classes");
        const userCollection = client.db("skillShareDb").collection("users");
        const teacherRequestCollection = client.db('skillShareDb').collection('teacherRequest');
        const enrolledCollection = client.db('skillShareDb').collection('enrolled');
        const paymentCollection = client.db('skillShareDb').collection('payments');
        const reviewCollection = client.db('bistroDb').collection('reviews');


        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            });
            res.send({ token });
        });

        // middlewares
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // use verify teacher after verifyToken
        const verifyTeacher = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isTeacher = user?.role === 'teacher';
            if (!isTeacher) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }


        // users (student) related api
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        // user profile fetch
        app.get('/users/profile/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            if (user) {
                res.send(user);
            } else {
                res.status(404).send({ message: 'User not found' });
            }
        });

        // check admin api
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        });

        // check teacher api
        app.get('/users/teacher/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let teacher = false;
            if (user) {
                teacher = user?.role === 'teacher';
            }
            res.send({ teacher });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            user.role = user.role || 'student';
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        // make admin
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        //make teacher
        // app.patch('/users/teacher/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const filter = { _id: new ObjectId(id) };
        //     const updatedDoc = {
        //         $set: {
        //             role: 'teacher'
        //         }
        //     };
        //     const result = await userCollection.updateOne(filter, updatedDoc);
        //     res.send(result);
        // });

        // users delete
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        // review
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        })


        // ----------------------------------------------------------------------------

        // teacher requests related api
        app.get('/teachers/teacher-requests', verifyToken, verifyAdmin, async (req, res) => {
            const result = await teacherRequestCollection.find().toArray();
            res.send(result);
        });

        app.post('/teachers/teacher-requests', verifyToken, async (req, res) => {
            const request = req.body;
            const result = await teacherRequestCollection.insertOne(request);
            res.send(result);
        });

        app.patch('/teachers/teacher-requests/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { status: 'accepted' }
            };
            const result = await teacherRequestCollection.updateOne(filter, updateDoc);

            // Update user role to teacher
            const teacherRequest = await teacherRequestCollection.findOne({ _id: new ObjectId(id) });
            await userCollection.updateOne(
                { email: teacherRequest.email },
                { $set: { role: 'teacher' } }
            );

            res.send(result);
        });

        app.patch('/teachers/teacher-requests/:id/reject', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { status: 'rejected' }
            };
            // const result = await teacherRequestCollection.updateOne(filter, updateDoc);
            // res.send(result);

            const updateResult = await teacherRequestCollection.updateOne(filter, updateDoc);

            if (updateResult.modifiedCount > 0) {
                // Delete the request after updating the status
                const deleteResult = await teacherRequestCollection.deleteOne(filter);

                if (deleteResult.deletedCount > 0) {
                    res.send({ success: true });
                } else {
                    res.status(500).send({ message: 'Failed to delete the request' });
                }
            } else {
                res.status(500).send({ message: 'Failed to update the request' });
            }
        });
        // ----------------------------------------------------------------------------

        // classes related api
        app.get('/classes', async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result);
        })


        app.post('/classes', verifyToken, verifyTeacher, async (req, res) => {
            const item = req.body;
            const result = await classCollection.insertOne(item);
            res.send(result);
        });

        app.get('/classes/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classCollection.findOne(query);
            res.send(result);
        })

        // email dia data get kora
        app.get('/classes/teacher/:email', verifyToken, verifyTeacher, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const classes = await classCollection.find(query).toArray();
            res.send(classes);
        });

        app.patch('/classes/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    title: item.title,
                    price: item.price,
                    description: item.description,
                    image: item.image
                }
            }
            const result = await classCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        // delete classes (my class e teacher delete class)
        app.delete('/classes/:id', verifyToken, verifyTeacher, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classCollection.deleteOne(query);
            res.send(result);
        })


        app.patch('/classes/class-requests/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { status: 'accepted' }
            };
            const result = await classCollection.updateOne(filter, updateDoc)
            res.send(result)
        });

        app.patch('/classes/class-requests/:id/reject', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { status: 'rejected' }
            };
            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        //enrolled related api
        app.post('/enrolled', async (req, res) => {
            const enrolledItem = req.body;
            const result = await enrolledCollection.insertOne(enrolledItem);
            res.send(result);
        })

        // enrolled data get
        app.get('/enrolled/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const classes = await enrolledCollection.find(query).toArray();
            res.send(classes);
        });



        // payment related api
        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent');

            // const paymentIntent = await stripe.paymentIntens.create({
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                // payment_method_types: ['string']
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // my enrolled page with payment 
        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })



        // payment post api
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);

            // Update the status of the enrolled class from "pending" to "approved"
            // const query = { enrollId: payment.enrollId };
            // const updateDoc = {
            //     $set: { status: 'confirm enrolled' }
            // };
            // await enrolledCollection.updateOne(query, updateDoc);

            // Send a response indicating that the payment was successful

            // console.log('payment info', payment);
            // const query = {
            //     _id: {
            //         $in: payment.cartIds.map(id => new ObjectId(id))
            //     }
            // };

            // const deleteResult = await enrolledCollection.deleteMany(query);

            // res.send({ paymentResult, deleteResult })
            res.send({ paymentResult })




            // res.send({ paymentResult });
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('skillShare is running')
})

app.listen(port, () => {
    console.log(`SkillShare is running on port${port}`);
})



// learn from best teacher with best support 