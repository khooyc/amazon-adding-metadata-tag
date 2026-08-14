# Keep classification and file changes human-controlled and local

The application uses human decisions as the only authority for adding or removing the synthetic-performer tag, keeps all media processing on the local Windows PC, and excludes Amazon upload automation. Optional computer-vision connectors may prioritize the same review queue later, but they cannot approve decisions or mutate files; this preserves privacy and prevents uncertain model output from silently becoming a compliance action.
