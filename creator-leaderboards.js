#!/usr/bin/env node
/**
 * Creator Leaderboards Service - Phase IV
 * Gamified creator ranking system with viral score tracking
 * Enhanced with Stripe API integration for real payment data
 */

const http = require('http');
const https = require('https');
require('dotenv').config(); // Load environment variables

const PORT = process.env.PORT_CREATOR_LEADERBOARDS || 8085;

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_...';
const STRIPE_API_VERSION = '2023-10-16';
const STRIPE_ENABLED = process.env.STRIPE_ENABLED !== 'false' && STRIPE_SECRET_KEY !== 'sk_test_...';
const STRIPE_TEST_MODE = STRIPE_SECRET_KEY?.startsWith('sk_test_') || false;

// Stripe webhook signing secret
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_Ph3aYXGMzEqYbhas3IWzEhhgw47GxY7O';

// Helper: get raw body for webhook verification
function getRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

// Stripe API helper function
const stripeRequest = (endpoint, method = 'GET', data = null) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.stripe.com',
            port: 443,
            path: `/v1/${endpoint}`,
            method: method,
            headers: {
                'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                'Stripe-Version': STRIPE_API_VERSION,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`Stripe API Error: ${response.error?.message || 'Unknown error'}`));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => reject(new Error('Stripe API timeout')));
        
        if (data && method !== 'GET') {
            req.write(new URLSearchParams(data).toString());
        }
        req.end();
    });
};

// Mock creator data with realistic viral performance and Stripe integration
let creators = [
    {
        id: 'cr_001',
        name: 'ShadowWhisper',
        avatar: 'https://via.placeholder.com/64/8b5cf6/ffffff?text=SW',
        tier: 'Ghost',
        viralScore: 7.2,
        weeklyRevenue: 2850,
        followers: 48500,
        engagement: 12.8,
        totalEarnings: 18420,
        joinDate: '2024-03-15',
        lastActive: new Date().toISOString(),
        platforms: ['tiktok', 'youtube', 'instagram'],
        topContent: 'Haunted mansion series',
        avgViralScore: 6.8,
        contentCount: 47,
        referralCount: 23,
        // Stripe integration fields
        stripeCustomerId: 'cus_shadowwhisper001',
        stripeAccountId: 'acct_shadow001',
        stripePayments: [],
        stripeSubscriptions: [],
        lastStripeSync: null,
        stripeRevenue: {
            total: 0,
            monthly: 0,
            weekly: 0,
            pendingPayouts: 0
        }
    },
    {
        id: 'cr_002', 
        name: 'NightmareQueen',
        avatar: 'https://via.placeholder.com/64/00ff41/000000?text=NQ',
        tier: 'Wraith',
        viralScore: 4.3,
        weeklyRevenue: 1240,
        followers: 23100,
        engagement: 9.4,
        totalEarnings: 8920,
        joinDate: '2024-04-02',
        lastActive: new Date().toISOString(),
        platforms: ['tiktok', 'instagram'],
        topContent: 'Horror makeup tutorials',
        avgViralScore: 4.1,
        contentCount: 32,
        referralCount: 15,
        // Stripe integration fields
        stripeCustomerId: 'cus_nightmarequeen002',
        stripeAccountId: 'acct_nightmare002',
        stripePayments: [],
        stripeSubscriptions: [],
        lastStripeSync: null,
        stripeRevenue: {
            total: 0,
            monthly: 0,
            weekly: 0,
            pendingPayouts: 0
        }
    },
    {
        id: 'cr_003',
        name: 'GhostlyGamer',
        avatar: 'https://via.placeholder.com/64/ff6b6b/ffffff?text=GG',
        tier: 'Possessed',
        viralScore: 2.8,
        weeklyRevenue: 680,
        followers: 15800,
        engagement: 7.2,
        totalEarnings: 4520,
        joinDate: '2024-05-20',
        lastActive: new Date().toISOString(),
        platforms: ['youtube', 'tiktok'],
        topContent: 'Horror game reactions',
        avgViralScore: 2.5,
        contentCount: 28,
        referralCount: 8,
        // Stripe integration fields
        stripeCustomerId: 'cus_ghostlygamer003',
        stripeAccountId: 'acct_ghostly003',
        stripePayments: [],
        stripeSubscriptions: [],
        lastStripeSync: null,
        stripeRevenue: {
            total: 0,
            monthly: 0,
            weekly: 0,
            pendingPayouts: 0
        }
    },
    {
        id: 'cr_004',
        name: 'PhantomPoet',
        avatar: 'https://via.placeholder.com/64/ffd93d/000000?text=PP',
        tier: 'Shadow',
        viralScore: 1.6,
        weeklyRevenue: 180,
        followers: 7200,
        engagement: 5.1,
        totalEarnings: 820,
        joinDate: '2024-06-10',
        lastActive: new Date().toISOString(),
        platforms: ['instagram', 'tiktok'],
        topContent: 'Dark poetry readings',
        avgViralScore: 1.4,
        contentCount: 19,
        referralCount: 3,
        // Stripe integration fields
        stripeCustomerId: 'cus_phantompoet004',
        stripeAccountId: 'acct_phantom004',
        stripePayments: [],
        stripeSubscriptions: [],
        lastStripeSync: null,
        stripeRevenue: {
            total: 0,
            monthly: 0,
            weekly: 0,
            pendingPayouts: 0
        }
    },
    {
        id: 'cr_005',
        name: 'SpectralStoryteller',
        avatar: 'https://via.placeholder.com/64/9d4edd/ffffff?text=SS',
        tier: 'Wraith',
        viralScore: 5.7,
        weeklyRevenue: 1580,
        followers: 31200,
        engagement: 11.3,
        totalEarnings: 12400,
        joinDate: '2024-02-28',
        lastActive: new Date().toISOString(),
        platforms: ['youtube', 'instagram', 'tiktok'],
        topContent: 'Ghost story narrations',
        avgViralScore: 5.2,
        contentCount: 41,
        referralCount: 19,
        // Stripe integration fields
        stripeCustomerId: 'cus_spectralstory005',
        stripeAccountId: 'acct_spectral005',
        stripePayments: [],
        stripeSubscriptions: [],
        lastStripeSync: null,
        stripeRevenue: {
            total: 0,
            monthly: 0,
            weekly: 0,
            pendingPayouts: 0
        }
    }
];

// Stripe integration functions
async function fetchStripePayments(creatorId) {
    const creator = creators.find(c => c.id === creatorId);
    if (!creator?.stripeCustomerId) return [];
    
    try {
        // Fetch payment intents for this customer
        const payments = await stripeRequest(
            `payment_intents?customer=${creator.stripeCustomerId}&limit=100`
        );
        
        return payments.data?.filter(p => p.status === 'succeeded') || [];
    } catch (error) {
        console.warn(`⚠️ Could not fetch Stripe payments for ${creatorId}:`, error.message);
        return [];
    }
}

async function fetchStripeSubscriptions(creatorId) {
    const creator = creators.find(c => c.id === creatorId);
    if (!creator?.stripeCustomerId) return [];
    
    try {
        // Fetch subscriptions for this customer
        const subscriptions = await stripeRequest(
            `subscriptions?customer=${creator.stripeCustomerId}&status=active`
        );
        
        return subscriptions.data || [];
    } catch (error) {
        console.warn(`⚠️ Could not fetch Stripe subscriptions for ${creatorId}:`, error.message);
        return [];
    }
}

async function updateCreatorStripeData(creatorId) {
    const creator = creators.find(c => c.id === creatorId);
    if (!creator) return;
    
    try {
        console.log(`💳 Syncing Stripe data for ${creator.name}...`);
        
        // Fetch payments and subscriptions
        const [payments, subscriptions] = await Promise.all([
            fetchStripePayments(creatorId),
            fetchStripeSubscriptions(creatorId)
        ]);
        
        // Update creator's Stripe data
        creator.stripePayments = payments.slice(0, 20); // Keep last 20 payments
        creator.stripeSubscriptions = subscriptions;
        creator.lastStripeSync = new Date().toISOString();
        
        // Calculate revenue from Stripe data
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        // Calculate total revenue
        creator.stripeRevenue.total = payments.reduce((sum, payment) => {
            return sum + (payment.amount / 100); // Convert cents to dollars
        }, 0);
        
        // Calculate weekly revenue
        creator.stripeRevenue.weekly = payments
            .filter(p => new Date(p.created * 1000) >= oneWeekAgo)
            .reduce((sum, payment) => sum + (payment.amount / 100), 0);
        
        // Calculate monthly revenue
        creator.stripeRevenue.monthly = payments
            .filter(p => new Date(p.created * 1000) >= oneMonthAgo)
            .reduce((sum, payment) => sum + (payment.amount / 100), 0);
        
        // Calculate subscription revenue
        const subscriptionRevenue = subscriptions.reduce((sum, sub) => {
            if (sub.status === 'active' && sub.items?.data?.[0]?.price) {
                return sum + (sub.items.data[0].price.unit_amount / 100);
            }
            return sum;
        }, 0);
        
        // Update weekly revenue with real Stripe data if available
        if (creator.stripeRevenue.weekly > 0) {
            creator.weeklyRevenue = creator.stripeRevenue.weekly;
        }
        
        // Update total earnings with real Stripe data if available
        if (creator.stripeRevenue.total > 0) {
            creator.totalEarnings = creator.stripeRevenue.total;
        }
        
        // Simulate pending payouts (in real implementation, fetch from Stripe Balance)
        creator.stripeRevenue.pendingPayouts = creator.stripeRevenue.weekly * 0.1;
        
        console.log(`✅ Stripe sync complete for ${creator.name}: $${creator.stripeRevenue.total.toFixed(2)} total`);
        
    } catch (error) {
        console.error(`❌ Stripe sync failed for ${creatorId}:`, error.message);
    }
}

async function syncAllCreatorsWithStripe() {
    console.log('🔄 Starting Stripe synchronization for all creators...');
    
    for (const creator of creators) {
        await updateCreatorStripeData(creator.id);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('✅ Stripe synchronization complete for all creators');
}

// Create Stripe customer for a creator
async function createStripeCustomer(creatorId) {
    const creator = creators.find(c => c.id === creatorId);
    if (!creator || creator.stripeCustomerId !== `cus_${creator.name.toLowerCase().replace(/[^a-z0-9]/g, '')}${creator.id.slice(-3)}`) {
        return null;
    }
    
    try {
        const customer = await stripeRequest('customers', 'POST', {
            name: creator.name,
            email: `${creator.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@hauntedempire.com`,
            'metadata[creator_id]': creatorId,
            'metadata[tier]': creator.tier,
            'metadata[platform]': creator.platforms.join(',')
        });
        
        creator.stripeCustomerId = customer.id;
        console.log(`✅ Created Stripe customer for ${creator.name}: ${customer.id}`);
        return customer;
    } catch (error) {
        console.error(`❌ Failed to create Stripe customer for ${creatorId}:`, error.message);
        return null;
    }
}

// Create a payment intent for creator content
async function createPaymentIntent(creatorId, amount, description = 'Haunted content purchase') {
    const creator = creators.find(c => c.id === creatorId);
    if (!creator) throw new Error('Creator not found');
    
    // Ensure creator has Stripe customer
    if (!creator.stripeCustomerId.startsWith('cus_')) {
        await createStripeCustomer(creatorId);
    }
    
    try {
        const paymentIntent = await stripeRequest('payment_intents', 'POST', {
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            customer: creator.stripeCustomerId,
            description: description,
            'metadata[creator_id]': creatorId,
            'metadata[creator_name]': creator.name,
            'metadata[content_type]': 'haunted_content'
        });
        
        console.log(`💰 Created payment intent for ${creator.name}: $${amount}`);
        return paymentIntent;
    } catch (error) {
        console.error(`❌ Failed to create payment intent for ${creatorId}:`, error.message);
        throw error;
    }
}

// Simulate real-time data changes
function updateCreatorData() {
    creators.forEach(creator => {
        // Viral score fluctuation
        const change = (Math.random() - 0.5) * 0.3;
        creator.viralScore = Math.max(0.1, creator.viralScore + change);
        
        // Revenue updates
        const revenueChange = (Math.random() - 0.4) * 50;
        creator.weeklyRevenue = Math.max(0, creator.weeklyRevenue + revenueChange);
        
        // Follower growth
        const followerGrowth = Math.floor(Math.random() * 20) - 5;
        creator.followers = Math.max(0, creator.followers + followerGrowth);
        
        // Engagement fluctuation
        const engagementChange = (Math.random() - 0.5) * 0.5;
        creator.engagement = Math.max(0.1, creator.engagement + engagementChange);
        
        // Update tier based on weekly revenue
        if (creator.weeklyRevenue >= 2000) {
            creator.tier = 'Ghost';
        } else if (creator.weeklyRevenue >= 750) {
            creator.tier = 'Wraith';
        } else if (creator.weeklyRevenue >= 250) {
            creator.tier = 'Possessed';
        } else {
            creator.tier = 'Shadow';
        }
        
        creator.lastActive = new Date().toISOString();
    });
    
    // Sort by viral score
    creators.sort((a, b) => b.viralScore - a.viralScore);
}

// Update data every 10 seconds and sync with Stripe every 5 minutes
setInterval(updateCreatorData, 10000);
setInterval(syncAllCreatorsWithStripe, 300000); // 5 minutes

// Initial Stripe sync
if (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY !== 'sk_test_...') {
    console.log('🔄 Starting initial Stripe synchronization...');
    setTimeout(() => syncAllCreatorsWithStripe(), 2000);
} else {
    console.log('⚠️ Stripe API key not configured, using simulated data only');
}

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Stripe webhook endpoint (must read raw body, not JSON)
    if (url.pathname === '/webhook' && req.method === 'POST') {
        getRawBody(req).then(rawBody => {
            const sig = req.headers['stripe-signature'];
            if (!sig) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Missing Stripe signature header' }));
                return;
            }
            // Verify signature using crypto (no stripe SDK)
            const crypto = require('crypto');
            let event = null;
            try {
                const [timestamp, signatures] = (() => {
                    // Stripe signature header: t=timestamp,v1=signature,...
                    const parts = sig.split(',').reduce((acc, part) => {
                        const [k, v] = part.split('=');
                        acc[k] = v;
                        return acc;
                    }, {});
                    return [parts.t, parts.v1];
                })();
                const signedPayload = `${timestamp}.${rawBody}`;
                const expectedSig = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET)
                    .update(signedPayload, 'utf8')
                    .digest('hex');
                if (signatures !== expectedSig) {
                    throw new Error('Invalid Stripe signature');
                }
                event = JSON.parse(rawBody);
            } catch (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Webhook signature verification failed', message: err.message }));
                return;
            }
            // Handle event
            console.log('🔔 Stripe webhook event received:', event.type);
            // Add your event handling logic here
            res.writeHead(200);
            res.end(JSON.stringify({ received: true, type: event.type }));
        }).catch(err => {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Webhook error', message: err.message }));
        });
        return;
    }

    try {
        if (url.pathname === '/stats') {
            res.writeHead(200);
            res.end(JSON.stringify({
                service: 'Creator Leaderboards',
                status: 'operational',
                port: PORT,
                uptime: process.uptime(),
                creators: creators.length,
                stripe_integration: {
                    configured: STRIPE_SECRET_KEY && STRIPE_SECRET_KEY !== 'sk_test_...',
                    last_sync: creators[0]?.lastStripeSync || null,
                    api_version: STRIPE_API_VERSION
                },
                timestamp: new Date().toISOString()
            }));
            
        } else if (url.pathname === '/creators') {
            const limit = parseInt(url.searchParams.get('limit')) || 10;
            const offset = parseInt(url.searchParams.get('offset')) || 0;
            
            const paginatedCreators = creators.slice(offset, offset + limit);
            
            res.writeHead(200);
            res.end(JSON.stringify({
                creators: paginatedCreators,
                total: creators.length,
                limit,
                offset,
                timestamp: new Date().toISOString()
            }));
            
        } else if (url.pathname.startsWith('/creators/') && url.pathname !== '/creators/') {
            const creatorId = url.pathname.split('/')[2];
            const creator = creators.find(c => c.id === creatorId);
            
            if (creator) {
                res.writeHead(200);
                res.end(JSON.stringify({
                    creator,
                    timestamp: new Date().toISOString()
                }));
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({
                    error: 'Creator not found',
                    creatorId
                }));
            }
            
        } else if (url.pathname === '/leaderboard') {
            const sortBy = url.searchParams.get('sort') || 'viralScore';
            const tier = url.searchParams.get('tier');
            
            let filteredCreators = [...creators];
            
            if (tier) {
                filteredCreators = filteredCreators.filter(c => 
                    c.tier.toLowerCase() === tier.toLowerCase()
                );
            }
            
            filteredCreators.sort((a, b) => {
                switch (sortBy) {
                    case 'revenue': return b.weeklyRevenue - a.weeklyRevenue;
                    case 'followers': return b.followers - a.followers;
                    case 'engagement': return b.engagement - a.engagement;
                    default: return b.viralScore - a.viralScore;
                }
            });
            
            res.writeHead(200);
            res.end(JSON.stringify({
                leaderboard: filteredCreators,
                sortBy,
                tier: tier || 'all',
                timestamp: new Date().toISOString()
            }));
            
        } else if (url.pathname === '/creators/stripe-sync') {
            // Manual Stripe synchronization endpoint
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const data = JSON.parse(body);
                        const creatorId = data.creator_id;
                        
                        if (creatorId) {
                            await updateCreatorStripeData(creatorId);
                            const creator = creators.find(c => c.id === creatorId);
                            
                            res.writeHead(200);
                            res.end(JSON.stringify({
                                success: true,
                                creator_id: creatorId,
                                stripe_revenue: creator?.stripeRevenue,
                                last_sync: creator?.lastStripeSync,
                                timestamp: new Date().toISOString()
                            }));
                        } else {
                            await syncAllCreatorsWithStripe();
                            
                            res.writeHead(200);
                            res.end(JSON.stringify({
                                success: true,
                                synced_creators: creators.length,
                                timestamp: new Date().toISOString()
                            }));
                        }
                    } catch (error) {
                        res.writeHead(400);
                        res.end(JSON.stringify({
                            error: 'Sync failed',
                            message: error.message
                        }));
                    }
                });
            } else {
                res.writeHead(405);
                res.end(JSON.stringify({ error: 'Method not allowed' }));
            }
            
        } else if (url.pathname === '/creators/create-payment') {
            // Create payment intent for creator content
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const data = JSON.parse(body);
                        const { creator_id, amount, description } = data;
                        
                        if (!creator_id || !amount) {
                            res.writeHead(400);
                            res.end(JSON.stringify({
                                error: 'Missing required fields: creator_id, amount'
                            }));
                            return;
                        }
                        
                        const paymentIntent = await createPaymentIntent(creator_id, amount, description);
                        
                        res.writeHead(200);
                        res.end(JSON.stringify({
                            success: true,
                            payment_intent: {
                                id: paymentIntent.id,
                                client_secret: paymentIntent.client_secret,
                                amount: paymentIntent.amount / 100,
                                currency: paymentIntent.currency,
                                status: paymentIntent.status
                            },
                            creator_id,
                            timestamp: new Date().toISOString()
                        }));
                    } catch (error) {
                        res.writeHead(400);
                        res.end(JSON.stringify({
                            error: 'Payment creation failed',
                            message: error.message
                        }));
                    }
                });
            } else {
                res.writeHead(405);
                res.end(JSON.stringify({ error: 'Method not allowed' }));
            }
            
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({
                error: 'Endpoint not found',
                availableEndpoints: ['/stats', '/creators', '/creators/:id', '/leaderboard', '/creators/stripe-sync', '/creators/create-payment']
            }));
        }
        
    } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({
            error: 'Internal server error',
            message: error.message
        }));
    }
});

server.listen(PORT, () => {
    console.log(`👑 Creator Leaderboards Service running on port ${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/stats`);
    console.log(`📊 Leaderboard: http://localhost:${PORT}/leaderboard`);
    console.log(`💳 Stripe Integration: ${STRIPE_ENABLED ? 'Enabled' : 'Disabled'} (${STRIPE_TEST_MODE ? 'Test Mode' : 'Live Mode'})`);
    if (STRIPE_ENABLED) {
        console.log(`   🔄 Sync Endpoint: http://localhost:${PORT}/creators/stripe-sync`);
        console.log(`   💰 Payment Endpoint: http://localhost:${PORT}/creators/create-payment`);
    }
    
    // Perform initial Stripe sync if enabled
    if (STRIPE_ENABLED) {
        console.log('🔄 Performing initial Stripe data synchronization...');
        syncAllCreatorsWithStripe().then(() => {
            console.log('✅ Initial Stripe sync completed');
        }).catch((error) => {
            console.error('❌ Initial Stripe sync failed:', error.message);
        });
    }
    
    // Set up periodic Stripe synchronization (every 5 minutes)
    if (STRIPE_ENABLED) {
        setInterval(async () => {
            try {
                console.log('🔄 Performing scheduled Stripe sync...');
                await syncAllCreatorsWithStripe();
                console.log('✅ Scheduled Stripe sync completed');
            } catch (error) {
                console.error('❌ Scheduled Stripe sync failed:', error.message);
            }
        }, 5 * 60 * 1000);
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
    } else {
        console.error('❌ Server error:', err);
    }
    process.exit(1);
});
