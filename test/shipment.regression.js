
"use strict";

const { PostgreSqlContainer } = require("@testcontainers/postgresql");
const { Client } = require("pg");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");

const {
    Customer,
    Parcel,
    ShipmentRequest,
    ShipmentStatus: S
} = require("../src/models");

const {
    CustomerRepository,
    ParcelRepository,
    ShipmentRepository
} = require("../src/repositories");

const {
    ShippingService,
    ShipmentRejectedError
} = require("../src/service");

jest.setTimeout(120000);

let container;
let client;
let customers;
let parcels;
let shipments;
let service;

beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17.6-alpine").start();

    client = new Client({
        connectionString: container.getConnectionUri()
    });

    await client.connect();

    await client.query(
        readFileSync(
            join(__dirname, "../migrations/V1__create_tables.sql"),
            "utf8"
        )
    );

    customers = new CustomerRepository(client);
    parcels = new ParcelRepository(client);
    shipments = new ShipmentRepository(client);

    service = new ShippingService(
        customers,
        parcels,
        shipments,
        { isAllowed: async () => true }
    );
});

afterAll(async () => {
    try {
        if (client) await client.end();
    } finally {
        if (container) await container.stop();
    }
});

// Унікальні тестові дані
const customer = () =>
    customers.create(new Customer(0, randomUUID(), false));

const parcel = () =>
    parcels.create(new Parcel(0, randomUUID(), 1000, 0, 10, 10, 10));

const request = (person, packageData) =>
    new ShipmentRequest(
        randomUUID(),
        person.id,
        packageData.id,
        100
    );

// Очищення даних перед кожним тестом
beforeEach(async () => {
    await client.query(
        "TRUNCATE TABLE shipments, parcels, customers RESTART IDENTITY CASCADE"
    );
});

const cases = [
    // SMOKE 1
    ["[smoke] Відправлення зберігається у БД", async () => {
        const saved = await service.createShipment(
            request(await customer(), await parcel())
        );

        expect(saved.status).toBe(S.REGISTERED);
        expect(await shipments.findById(saved.id)).toEqual(saved);
    }],

    // SMOKE 2
    ["[smoke] Передача відправлення в доставку", async () => {
        // Виправлено order dependency:
        // тест сам створює відправлення.
        const shipment = await service.createShipment(
            request(await customer(), await parcel())
        );

        const saved = await service.dispatch(shipment.id);

        expect(saved.status).toBe(S.DISPATCHED);
        expect(await shipments.findById(shipment.id)).toEqual(saved);
    }],

    ["Картка посилки зберігає вагу", async () => {
        const saved = await parcels.create(
            new Parcel(0, randomUUID(), 1000, 0, 10, 10, 10)
        );

        expect(
            (await parcels.findById(saved.id)).weightGrams
        ).toBe(1000);
    }],

    ["Картка посилки зберігає оголошену вартість", async () => {
        // Виправлено shared state:
        // кожна посилка має унікальний код.
        const saved = await parcels.create(
            new Parcel(0, randomUUID(), 2000, 10000, 10, 10, 10)
        );

        expect(
            (await parcels.findById(saved.id)).declaredValue
        ).toBe(10000);
    }],

    ["Відправлення після зовнішнього дозволу", async () => {
        const person = await customer();
        const data = request(person, await parcel());

        const delayed = new ShippingService(
            customers,
            parcels,
            shipments,
            {
                isAllowed: async () => {
                    // Імітація асинхронної зовнішньої перевірки
                    return true;
                }
            }
        );

        // Виправлено fixed wait:
        // чекаємо завершення операції, а не 50 мс.
        await delayed.createShipment(data);

        const saved = await shipments.findShipments(
            person.id,
            S.REGISTERED
        );

        expect(saved).toHaveLength(1);
        expect(saved[0].reference).toBe(data.reference);
        expect(saved[0].total).toBe(7000);
    }],

    ["Вибірка містить два відправлення клієнта", async () => {
        const person = await customer();

        const prefix = randomUUID().slice(0, 8);
        const references = [
            prefix + "-A",
            prefix + "-B"
        ];

        const fixtureOrder =
            process.env.REGRESSION_REVERSE_FIXTURE === "true"
                ? [...references].reverse()
                : references;

        for (const reference of fixtureOrder) {
            await service.createShipment(
                new ShipmentRequest(
                    reference,
                    person.id,
                    (await parcel()).id,
                    100
                )
            );
        }

        const result = await client.query(
            "SELECT reference FROM shipments WHERE customer_id=$1",
            [person.id]
        );

        // Виправлено залежність від порядку SQL-рядків
        expect(
            result.rows.map(row => row.reference).sort()
        ).toEqual([...references].sort());
    }],

    // SMOKE 3
    ["[smoke] Завершення доставки зберігає стан", async () => {
        const saved = await service.createShipment(
            request(await customer(), await parcel())
        );

        await service.dispatch(saved.id);

        const delivered = await service.deliver(saved.id);

        expect(delivered.status).toBe(S.DELIVERED);
        expect(await shipments.findById(saved.id)).toEqual(delivered);
    }],

    ["Завершення до відправлення відхиляється", async () => {
        const saved = await service.createShipment(
            request(await customer(), await parcel())
        );

        await expect(
            service.deliver(saved.id)
        ).rejects.toBeInstanceOf(ShipmentRejectedError);

        expect(await shipments.findById(saved.id)).toEqual(saved);
    }],

    ["Зовнішня відмова не створює відправлення", async () => {
        const person = await customer();

        const denied = new ShippingService(
            customers,
            parcels,
            shipments,
            { isAllowed: async () => false }
        );

        await expect(
            denied.createShipment(
                request(person, await parcel())
            )
        ).rejects.toBeInstanceOf(ShipmentRejectedError);

        expect(
            await shipments.findShipments(person.id, S.REGISTERED)
        ).toEqual([]);
    }],

    ["Повторне скасування не змінює відправлення", async () => {
        const saved = await service.createShipment(
            request(await customer(), await parcel())
        );

        const cancelled = await service.cancel(saved.id);

        await expect(
            service.cancel(saved.id)
        ).rejects.toBeInstanceOf(ShipmentRejectedError);

        expect(await shipments.findById(saved.id)).toEqual(cancelled);
    }]
];

// Можливість перевірити незалежність від порядку
if (process.env.REGRESSION_REVERSE_TESTS === "true") {
    cases.reverse();
}

for (const [name, scenario] of cases) {
    test(name, scenario);
}
