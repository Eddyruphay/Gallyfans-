// CommonJS version of our redis-auth-store, adapted for Knightbot-MD
const { proto } = require('@whiskeysockets/baileys');
const { BufferJSON } = require('@whiskeysockets/baileys/lib/Utils');

const KEY_PREFIX = 'auth:';

const useCustomRedisAuthState = async (redis) => {
    const writeData = (key, data) => {
        const jsonData = JSON.stringify(data, BufferJSON.replacer);
        return redis.set(`${KEY_PREFIX}${key}`, jsonData);
    };

    const readData = async (key) => {
        const data = await redis.get(`${KEY_PREFIX}${key}`);
        if (data) {
            return JSON.parse(data, BufferJSON.reviver);
        }
        return null;
    };

    const removeData = (key) => {
        return redis.del(`${KEY_PREFIX}${key}`);
    };

    const creds = (await readData('creds')) || proto.Message.fromObject({});

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => {
            return writeData('creds', creds);
        },
    };
};

module.exports = { useCustomRedisAuthState };
