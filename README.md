# omegga-behind-you

Spawn BRS files behind players in Brickadia games to spook them.

Perhaps the worst Omegga plugin created. Bad code, terrible concept. Have fun!

## Usage

`omegga install gh:voximity/omegga-behind-you`

cd `plugins/omegga-behind-you && npm i && cd ../..`

### Adding your own saves

You can configure your own saves to be loaded randomly as the object using
the `objects.json` file. It is an array of save objects with a `name` field
and a `weight` field.

The `name` field determines the name of the save, expected to be in `data/Saved/Builds`.

The `weight` field is the weight of the save. The higher the weight compared to other
save weights, the more likely it is to appear.

#### An example

```json
[
    {
        "name": "saveA",
        "weight": 1
    },
    {
        "name": "saveB",
        "weight": 2
    },
    {
        "name": "saveC",
        "weight": 3
    }
]
```

In this example, `saveA` has a weight of 1. The sum of all weights is 6, so the chance of
`saveA` being used is 1/6. On the contrary, `saveC` has a weight of 3, so its chance is
3/6 or 1/2.

In essence, use weights to control times you want certain saves to spawn in less frequently.
It's spookier that way.