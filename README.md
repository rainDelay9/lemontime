# lemontime

## Design

![lemontime design diagram](assets/lemontime_design.png 'Design Diagram')

## Improvements

1. DB
1. Lambda extension for Secrets Manager cache
1. Why not DocumentDB? (This is the better choice, but why am I not going for it?) - findOneAndAdd is the best for this (atomic OOTB), or even postgressql with array_append (although atomicity should be considered here)
1. Problem with 1-second triggers

## Thoughts

1. Why are programatical timers bad?

## TODO

1. checks for failure
1. delete on unsuccessful second write in post
1. add queue and write - DONE
1. add lambda to distribute (+ queue) - DONE
1. add lambda to fire url and update db status - DONE
1. fix DynamoDB permissions
1. implement fire time trigger - DONE
1. deploy to ECS - DONE (fargate)
1. ssm param with failsafe - DONE
