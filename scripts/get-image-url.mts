import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const image = await prisma.image.findFirst({
      where: {
        imageUrl: {
          not: null,
        },
      },
      orderBy: {
        id: 'desc',
      },
    });

    if (image && image.imageUrl) {
      console.log('Here is an image URL from the database:');
      console.log(image.imageUrl);
    } else {
      console.log('No images with a URL were found in the database.');
    }
  } catch (error) {
    console.error('An error occurred while fetching the image URL:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
