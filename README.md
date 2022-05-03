# lemontime

## Improvements

1. DB
1. Lambda extension for Secrets Manager cache
1. Why not DocumentDB? (This is the better choice, but why am I not going for it?) - findOneAndAdd is the best for this (atomic OOTB), or even postgressql with array_append (although atomicity should be considered here)
1. Problem with 1-second triggers

## TODO

1. checks for failure
1. delete on unsuccessful second write in post
1. add queue and write
1. add lambda to distribute (+ queue)
1. add lambda to fire url and update db status
1. fix DynamoDB permissions
