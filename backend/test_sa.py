import os
import sys

# Define a mock for the database and models to test the assignment logic
class MockRelation(list):
    def __set__(self, obj, value):
        print(f"Assigning {value} to relationship")
        # In SQLAlchemy, this would trigger validation or flush
        if not all(isinstance(x, str) for x in value):
             raise TypeError("Expected strings")
        super().__setitem__(slice(None), value)

class MockModule:
    def __init__(self):
        self.department_slugs = [] # This would be a relationship in real SA

m = MockModule()
m.department_slugs = ["obj1", "obj2"]
print("Initial:", m.department_slugs)
m.department_slugs = [str(x) for x in m.department_slugs]
print("After assignment:", m.department_slugs)

# The real test is if SQLAlchemy relationship handles this.
# Let's try to actually import the real models if possible.
try:
    from app import models
    print("Successfully imported models")
    mod = models.Module(title="Test")
    # This might fail because it's not in a session, but let's see
    mod.department_slugs = ["tech"] 
    print("Assigned string list to relationship successfully?")
except Exception as e:
    print(f"Caught expected error: {type(e).__name__}: {e}")
