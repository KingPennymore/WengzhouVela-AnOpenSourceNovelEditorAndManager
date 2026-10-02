local chapter = { title = "Lighthouse", words = 1200 }
local function describe(value)
  return value.title .. ": " .. value.words
end
print(describe(chapter))
